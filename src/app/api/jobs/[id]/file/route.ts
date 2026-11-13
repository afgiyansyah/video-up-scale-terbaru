import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { jobDir } from "@/lib/processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".3gp": "video/3gpp",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "input" ? "input" : "output";
  const download = url.searchParams.get("download") === "1";

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return new Response("Not found", { status: 404 });

  const dir = jobDir(id);
  let file: string;
  try {
    const names = await fsp.readdir(dir);
    const name = names.find((n) => n.startsWith(type));
    if (!name) return new Response("Not found", { status: 404 });
    file = path.join(/*turbopackIgnore: true*/ dir, name);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const total = stat.size;
  const contentType = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
  });
  if (download) {
    const base = job.originalName.replace(/\.[^.]+$/, "").replace(/[^\w.\- ]+/g, "_") || "video";
    headers.set("Content-Disposition", `attachment; filename="${base}-jernih.mp4"`);
  }

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? Number(m[1]) : NaN;
      let end = m[2] ? Number(m[2]) : NaN;
      if (Number.isNaN(start)) {
        // suffix range: bytes=-N
        start = Math.max(0, total - end);
        end = total - 1;
      } else if (Number.isNaN(end) || end >= total) {
        end = total - 1;
      }
      if (start > end || start >= total) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
      headers.set("Content-Length", String(end - start + 1));
      const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }
  }

  headers.set("Content-Length", String(total));
  const stream = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
