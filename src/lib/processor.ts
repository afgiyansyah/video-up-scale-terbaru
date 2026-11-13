import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import ffmpegStatic from "ffmpeg-static";
import { db } from "@/db";
import { jobs, type EnhanceSettings } from "@/db/schema";
import { computeOutputSize } from "@/lib/settings";

export const STORAGE_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "storage");

export function jobDir(id: string) {
  return path.join(/*turbopackIgnore: true*/ STORAGE_DIR, id);
}

function ffmpegBinary() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  const fallback = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "node_modules",
    "ffmpeg-static",
    "ffmpeg",
  );
  if (fs.existsSync(fallback)) return fallback;
  return "ffmpeg";
}

type Probe = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasVideo: boolean;
};

export function probeVideo(file: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegBinary(), ["-hide_banner", "-i", file]);
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", () => {
      const dur = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
      const vline = err.split("\n").find((l) => /Stream #.*Video:/.test(l)) ?? "";
      const size = vline.match(/,\s*(\d{2,5})x(\d{2,5})[\s,\[]/);
      const fpsM = vline.match(/([\d.]+)\s*fps/);
      const rot = err.match(/rotation of (-?[\d.]+) degrees/);
      let width = size ? Number(size[1]) : 0;
      let height = size ? Number(size[2]) : 0;
      if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [width, height] = [height, width];
      resolve({
        width,
        height,
        duration,
        fps: fpsM ? Number(fpsM[1]) : 0,
        hasVideo: Boolean(size),
      });
    });
  });
}

export function buildFilterChain(s: EnhanceSettings, srcW: number, srcH: number) {
  const f: string[] = [];

  if (s.denoise > 0) {
    const ls = 1 + s.denoise * 0.07;
    const cs = ls * 0.75;
    const lt = ls * 1.5;
    const ct = cs * 1.5;
    f.push(`hqdn3d=${ls.toFixed(2)}:${cs.toFixed(2)}:${lt.toFixed(2)}:${ct.toFixed(2)}`);
  }

  const out = computeOutputSize(srcW, srcH, s.targetShortSide);
  if (out.scale) f.push(`scale=${out.width}:${out.height}:flags=lanczos+accurate_rnd+full_chroma_int`);
  else if (srcW % 2 || srcH % 2) f.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");

  if (s.sharpen > 0) {
    const amount = (s.sharpen / 100) * 1.6;
    f.push(`unsharp=5:5:${amount.toFixed(2)}:5:5:0`);
  }

  if (s.contrast !== 0 || s.brightness !== 0 || s.saturation !== 0) {
    const contrast = 1 + s.contrast / 100;
    const brightness = s.brightness / 250;
    const saturation = 1 + s.saturation / 100;
    f.push(
      `eq=contrast=${contrast.toFixed(3)}:brightness=${brightness.toFixed(3)}:saturation=${saturation.toFixed(3)}`,
    );
  }

  f.push("format=yuv420p");
  return { chain: f.join(","), out };
}

/* ------------------------------ antrean ------------------------------ */

type QueueState = {
  queue: string[];
  running: boolean;
  initialized: boolean;
  procs: Map<string, ChildProcess>;
  cancelled: Set<string>;
};

const g = globalThis as typeof globalThis & { __enhanceQueue?: QueueState };
const state: QueueState = (g.__enhanceQueue ??= {
  queue: [],
  running: false,
  initialized: false,
  procs: new Map(),
  cancelled: new Set(),
});

/** Job yang menggantung karena server restart ditandai gagal. */
export async function ensureInit() {
  if (state.initialized) return;
  state.initialized = true;
  await db
    .update(jobs)
    .set({ status: "failed", error: "Proses terhenti karena server dimulai ulang. Silakan coba lagi." })
    .where(inArray(jobs.status, ["queued", "processing"]));
}

export function enqueue(id: string) {
  state.queue.push(id);
  void pump();
}

export function cancelJob(id: string) {
  state.cancelled.add(id);
  state.queue = state.queue.filter((q) => q !== id);
  const p = state.procs.get(id);
  if (p) p.kill("SIGKILL");
}

async function pump() {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const id = state.queue.shift()!;
      if (state.cancelled.has(id)) continue;
      try {
        await runJob(id);
      } catch (e) {
        await db
          .update(jobs)
          .set({ status: "failed", error: e instanceof Error ? e.message : String(e), finishedAt: new Date() })
          .where(eq(jobs.id, id));
      }
    }
  } finally {
    state.running = false;
  }
}

async function findInput(dir: string) {
  const files = await fsp.readdir(dir);
  const name = files.find((n) => n.startsWith("input"));
  if (!name) throw new Error("File video asli tidak ditemukan");
  return path.join(/*turbopackIgnore: true*/ dir, name);
}

async function runJob(id: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;

  const dir = jobDir(id);
  const input = await findInput(dir);
  const output = path.join(/*turbopackIgnore: true*/ dir, "output.mp4");

  await db.update(jobs).set({ status: "processing", progress: 0 }).where(eq(jobs.id, id));

  const probe = await probeVideo(input);
  if (!probe.hasVideo || !probe.width || !probe.height) {
    throw new Error("File ini bukan video yang valid atau formatnya tidak didukung.");
  }

  const s = job.settings;
  const { chain, out } = buildFilterChain(s, probe.width, probe.height);
  const effectiveDuration = s.preview && probe.duration ? Math.min(5, probe.duration) : probe.duration;

  await db
    .update(jobs)
    .set({
      srcWidth: probe.width,
      srcHeight: probe.height,
      outWidth: out.width,
      outHeight: out.height,
      duration: probe.duration,
      fps: probe.fps,
    })
    .where(eq(jobs.id, id));

  const args = ["-y", "-hide_banner", "-i", input];
  if (s.preview) args.push("-t", "5");
  args.push(
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", chain,
    "-c:v", "libx264",
    "-preset", s.quality === "high" ? "medium" : "veryfast",
    "-crf", s.quality === "high" ? "16" : "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-progress", "pipe:1",
    "-nostats",
    output,
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegBinary(), args);
    state.procs.set(id, proc);
    let errTail = "";
    let buf = "";
    let lastPct = -1;
    let lastWrite = 0;

    proc.stderr.on("data", (d) => {
      errTail = (errTail + d.toString()).slice(-1500);
    });
    proc.stdout.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/);
        if (!m || !effectiveDuration) continue;
        const pct = Math.min(99, Math.floor((Number(m[1]) / 1e6 / effectiveDuration) * 100));
        const now = Date.now();
        if (pct !== lastPct && now - lastWrite > 400) {
          lastPct = pct;
          lastWrite = now;
          void db.update(jobs).set({ progress: pct }).where(eq(jobs.id, id));
        }
      }
    });
    proc.on("error", (e) => {
      state.procs.delete(id);
      reject(e);
    });
    proc.on("close", (code) => {
      state.procs.delete(id);
      if (state.cancelled.has(id)) return reject(new Error("Dibatalkan"));
      if (code === 0) return resolve();
      const msg = errTail.split("\n").filter(Boolean).slice(-3).join(" ");
      reject(new Error(`ffmpeg gagal (kode ${code}). ${msg}`));
    });
  });

  const stat = await fsp.stat(output);
  await db
    .update(jobs)
    .set({ status: "done", progress: 100, outputSize: stat.size, finishedAt: new Date() })
    .where(eq(jobs.id, id));
}
