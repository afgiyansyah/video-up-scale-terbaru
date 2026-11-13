import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { enqueue, ensureInit, jobDir } from "@/lib/processor";
import { sanitizeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXT = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp", ".mpg", ".mpeg", ".ts", ".flv", ".wmv"];

export async function GET() {
  await ensureInit();
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(30);
  return Response.json({ jobs: rows });
}

export async function POST(request: Request) {
  await ensureInit();

  let name = "video.mp4";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "video.mp4");
  } catch {}
  name = name.replace(/[\\/]/g, "_").slice(0, 200);
  const ext = path.extname(name).toLowerCase();

  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("video/") && !ALLOWED_EXT.includes(ext)) {
    return Response.json({ error: "Format file tidak didukung. Unggah file video." }, { status: 400 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return Response.json({ error: "Ukuran video maksimal 500 MB." }, { status: 413 });
  }
  if (!request.body) {
    return Response.json({ error: "File kosong." }, { status: 400 });
  }

  let settingsRaw: unknown = {};
  try {
    settingsRaw = JSON.parse(decodeURIComponent(request.headers.get("x-settings") ?? "{}"));
  } catch {}
  const settings = sanitizeSettings(settingsRaw);

  const id = crypto.randomUUID();
  const dir = jobDir(id);
  await fsp.mkdir(dir, { recursive: true });
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : ".mp4";
  const inputPath = path.join(/*turbopackIgnore: true*/ dir, `input${safeExt}`);

  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_BYTES) return cb(new Error("TOO_BIG"));
      cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeReadableStream),
      counter,
      fs.createWriteStream(inputPath),
    );
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true });
    const tooBig = e instanceof Error && e.message === "TOO_BIG";
    return Response.json(
      { error: tooBig ? "Ukuran video maksimal 500 MB." : "Gagal menyimpan file unggahan." },
      { status: tooBig ? 413 : 500 },
    );
  }

  if (size === 0) {
    await fsp.rm(dir, { recursive: true, force: true });
    return Response.json({ error: "File kosong." }, { status: 400 });
  }

  const [job] = await db
    .insert(jobs)
    .values({ id, originalName: name, settings, inputSize: size, status: "queued" })
    .returning();

  enqueue(id);
  return Response.json({ job }, { status: 201 });
}
