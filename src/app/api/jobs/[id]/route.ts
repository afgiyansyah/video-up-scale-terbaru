import fsp from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { cancelJob, ensureInit, jobDir } from "@/lib/processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureInit();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
  return Response.json({ job });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
  cancelJob(id);
  await db.delete(jobs).where(eq(jobs.id, id));
  // beri waktu proses ffmpeg berhenti sebelum menghapus berkas
  setTimeout(() => {
    void fsp.rm(jobDir(id), { recursive: true, force: true });
  }, 500);
  return Response.json({ ok: true });
}
