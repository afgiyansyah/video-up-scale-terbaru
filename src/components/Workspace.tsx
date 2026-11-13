"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnhanceSettings } from "@/db/schema";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  RESOLUTIONS,
  computeOutputSize,
  formatBytes,
  formatDuration,
  resolutionLabel,
} from "@/lib/settings";
import type { ClientJob } from "@/lib/types";
import CompareSlider from "./CompareSlider";

const MAX_BYTES = 500 * 1024 * 1024;

type Meta = { w: number; h: number; duration: number };

function Slider({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const signed = min < 0;
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-sm font-medium text-white/90">{label}</label>
        <span className="text-xs tabular-nums text-fuchsia-300">
          {signed && value > 0 ? "+" : ""}
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-fuchsia-500"
      />
      {hint && <p className="mt-0.5 text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-amber-500/15 text-amber-300",
    processing: "bg-sky-500/15 text-sky-300",
    done: "bg-emerald-500/15 text-emerald-300",
    failed: "bg-rose-500/15 text-rose-300",
  };
  const label: Record<string, string> = {
    queued: "Antre",
    processing: "Memproses",
    done: "Selesai",
    failed: "Gagal",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? ""}`}>
      {label[status] ?? status}
    </span>
  );
}

export default function Workspace() {
  const [settings, setSettings] = useState<EnhanceSettings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<string | null>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [current, setCurrent] = useState<ClientJob | null>(null);
  const [history, setHistory] = useState<ClientJob[]>([]);
  const [eta, setEta] = useState<number | null>(null);
  const procStart = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  /* ---- muat riwayat ---- */
  useEffect(() => {
    let alive = true;
    fetch("/api/jobs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { jobs: ClientJob[] }) => {
        if (!alive) return;
        setHistory(d.jobs);
        const active = d.jobs.find((j) => j.status === "processing" || j.status === "queued");
        if (active) setCurrent(active);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* ---- polling job aktif ---- */
  const currentId = current?.id;
  const currentStatus = current?.status;
  useEffect(() => {
    if (!currentId || (currentStatus !== "queued" && currentStatus !== "processing")) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${currentId}`, { cache: "no-store" });
        if (!r.ok) return;
        const { job } = (await r.json()) as { job: ClientJob };
        if (job.status === "processing") {
          if (procStart.current === null) procStart.current = Date.now();
          if (job.progress > 2) {
            const elapsed = (Date.now() - procStart.current) / 1000;
            setEta((elapsed * (100 - job.progress)) / job.progress);
          }
        }
        setCurrent((c) => (c && c.id === currentId ? job : c));
        setHistory((h) => h.map((x) => (x.id === currentId ? job : x)));
      } catch {}
    }, 1000);
    return () => clearInterval(t);
  }, [currentId, currentStatus]);

  const update = <K extends keyof EnhanceSettings>(key: K, value: EnhanceSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setPreset(null);
  };

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSettings((s) => ({ ...s, ...p.settings }));
    setPreset(id);
  };

  const clearFile = useCallback(() => {
    setLocalUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    setFile(null);
    setMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi|3gp|mpe?g|ts|flv|wmv)$/i.test(f.name)) {
      setError("Format tidak didukung. Pilih file video (MP4, MOV, WebM, MKV, dll).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Ukuran video ${formatBytes(f.size)} melebihi batas 500 MB.`);
      return;
    }
    clearFile();
    setCurrent(null);
    setLocalUrl(URL.createObjectURL(f));
    setFile(f);
  };

  const startUpload = () => {
    if (!file) return;
    setError(null);
    setUploadPct(0);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/jobs");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-settings", encodeURIComponent(JSON.stringify(settings)));
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadPct(null);
      let body: { job?: ClientJob; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && body.job) {
        procStart.current = null;
        setEta(null);
        setCurrent(body.job);
        setHistory((h) => [body.job as ClientJob, ...h]);
        clearFile();
      } else {
        setError(body.error ?? "Gagal mengunggah video. Coba lagi.");
      }
    };
    xhr.onerror = () => {
      setUploadPct(null);
      setError("Koneksi terputus saat mengunggah. Coba lagi.");
    };
    xhr.onabort = () => setUploadPct(null);
    xhr.send(file);
  };

  const remove = async (id: string) => {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
    setHistory((h) => h.filter((x) => x.id !== id));
    setCurrent((c) => (c?.id === id ? null : c));
  };

  const selectJob = (j: ClientJob) => {
    clearFile();
    setError(null);
    procStart.current = null;
    setEta(null);
    setCurrent(j);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const newVideo = () => {
    setCurrent(null);
    setError(null);
  };

  const uploading = uploadPct !== null;
  const outPreview = meta ? computeOutputSize(meta.w, meta.h, settings.targetShortSide) : null;
  const active = current && (current.status === "queued" || current.status === "processing");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv,.avi,.flv,.wmv,.ts"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ------------------------- PANEL KIRI ------------------------- */}
        <section className="lg:col-span-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
            {/* 1. Belum ada file & job */}
            {!file && !current && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex min-h-[380px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
                  dragOver
                    ? "border-fuchsia-400 bg-fuchsia-500/10"
                    : "border-white/15 hover:border-fuchsia-400/60 hover:bg-white/[0.03]"
                }`}
              >
                <div className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-4xl shadow-lg shadow-fuchsia-500/30">
                  🎬
                </div>
                <h2 className="text-xl font-semibold text-white">Tarik & lepas video di sini</h2>
                <p className="mt-2 max-w-sm text-sm text-white/50">
                  atau klik untuk memilih file. Mendukung MP4, MOV, WebM, MKV, AVI — maksimal 500 MB.
                </p>
                <span className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-fuchsia-100">
                  Pilih Video
                </span>
              </div>
            )}

            {/* 2. File dipilih */}
            {file && !current && localUrl && (
              <div>
                <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                  <video
                    src={localUrl}
                    controls
                    playsInline
                    className="mx-auto max-h-[60vh] w-full object-contain"
                    onLoadedMetadata={(e) =>
                      setMeta({
                        w: e.currentTarget.videoWidth,
                        h: e.currentTarget.videoHeight,
                        duration: e.currentTarget.duration,
                      })
                    }
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="max-w-[240px] truncate rounded-full bg-white/10 px-3 py-1 text-white/80">
                    {file.name}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">{formatBytes(file.size)}</span>
                  {meta && (
                    <>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">
                        {resolutionLabel(meta.w, meta.h)}
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">
                        {formatDuration(meta.duration)}
                      </span>
                    </>
                  )}
                  <button
                    onClick={clearFile}
                    disabled={uploading}
                    className="ml-auto rounded-full px-3 py-1 text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    Ganti video
                  </button>
                </div>
                {meta && outPreview && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10 p-4 text-sm">
                    <span className="text-2xl">🔮</span>
                    <div className="text-white/80">
                      {outPreview.scale ? (
                        <>
                          Resolusi akan naik dari <b className="text-white">{meta.w}×{meta.h}</b> menjadi{" "}
                          <b className="text-fuchsia-300">{outPreview.width}×{outPreview.height}</b>
                        </>
                      ) : settings.targetShortSide ? (
                        <>
                          Video sudah berukuran {meta.w}×{meta.h} (≥ target). Hanya filter kejernihan yang
                          diterapkan.
                        </>
                      ) : (
                        <>Resolusi dipertahankan. Hanya filter kejernihan yang diterapkan.</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Sedang diproses */}
            {current && active && (
              <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                <div className="relative mb-6 grid h-36 w-36 place-items-center">
                  <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="url(#g)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 52}
                      strokeDashoffset={2 * Math.PI * 52 * (1 - current.progress / 100)}
                      className="transition-all duration-700"
                    />
                    <defs>
                      <linearGradient id="g" x1="0" x2="1">
                        <stop offset="0%" stopColor="#d946ef" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-3xl font-bold tabular-nums text-white">{current.progress}%</span>
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {current.status === "queued" ? "Menunggu antrean…" : "Sedang menjernihkan video…"}
                </h2>
                <p className="mt-2 max-w-sm text-sm text-white/50">
                  {current.originalName}
                  {current.srcWidth && current.outWidth ? (
                    <>
                      <br />
                      {current.srcWidth}×{current.srcHeight} → {current.outWidth}×{current.outHeight}
                    </>
                  ) : null}
                </p>
                {eta !== null && current.status === "processing" && (
                  <p className="mt-3 rounded-full bg-white/10 px-4 py-1 text-xs text-white/70">
                    Perkiraan sisa waktu ± {eta < 60 ? `${Math.max(1, Math.round(eta))} detik` : `${Math.round(eta / 60)} menit`}
                  </p>
                )}
                <button
                  onClick={() => remove(current.id)}
                  className="mt-6 rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 transition hover:bg-white/10"
                >
                  Batalkan
                </button>
              </div>
            )}

            {/* 4. Gagal */}
            {current && current.status === "failed" && (
              <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                <div className="mb-4 text-5xl">😵</div>
                <h2 className="text-xl font-semibold text-white">Pemrosesan gagal</h2>
                <p className="mt-2 max-w-md break-words text-sm text-rose-300/90">{current.error}</p>
                <button
                  onClick={newVideo}
                  className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900"
                >
                  Coba video lain
                </button>
              </div>
            )}

            {/* 5. Hasil */}
            {current && current.status === "done" && current.srcWidth && current.srcHeight && (
              <CompareSlider
                key={current.id}
                originalSrc={`/api/jobs/${current.id}/file?type=input`}
                enhancedSrc={`/api/jobs/${current.id}/file?type=output`}
                width={current.outWidth ?? current.srcWidth}
                height={current.outHeight ?? current.srcHeight}
              />
            )}
          </div>
        </section>

        {/* ------------------------- PANEL KANAN ------------------------- */}
        <aside className="lg:col-span-2">
          {!current ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Pengaturan Peningkatan</h3>

              <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-white/40">Preset cepat</p>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    disabled={uploading}
                    className={`rounded-2xl border p-3 text-left transition ${
                      preset === p.id
                        ? "border-fuchsia-400 bg-fuchsia-500/15"
                        : "border-white/10 bg-white/[0.03] hover:border-white/30"
                    }`}
                  >
                    <div className="text-lg">{p.emoji}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-[11px] leading-tight text-white/45">{p.desc}</div>
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-white/40">
                Resolusi tujuan
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => update("targetShortSide", r.value)}
                    disabled={uploading}
                    className={`rounded-xl border px-1 py-2 text-center transition ${
                      settings.targetShortSide === r.value
                        ? "border-fuchsia-400 bg-fuchsia-500/15 text-white"
                        : "border-white/10 text-white/70 hover:border-white/30"
                    }`}
                  >
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="text-[10px] text-white/40">{r.sub}</div>
                  </button>
                ))}
              </div>

              <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wider text-white/40">
                Penyempurnaan
              </p>
              <div className="space-y-4">
                <Slider
                  label="Pengurangan noise"
                  hint="Menghaluskan bintik & artefak kompresi"
                  value={settings.denoise}
                  min={0}
                  max={100}
                  disabled={uploading}
                  onChange={(v) => update("denoise", v)}
                />
                <Slider
                  label="Ketajaman detail"
                  hint="Mempertegas tepi & tekstur"
                  value={settings.sharpen}
                  min={0}
                  max={100}
                  disabled={uploading}
                  onChange={(v) => update("sharpen", v)}
                />
                <Slider
                  label="Kontras"
                  value={settings.contrast}
                  min={-50}
                  max={50}
                  disabled={uploading}
                  onChange={(v) => update("contrast", v)}
                />
                <Slider
                  label="Kecerahan"
                  value={settings.brightness}
                  min={-50}
                  max={50}
                  disabled={uploading}
                  onChange={(v) => update("brightness", v)}
                />
                <Slider
                  label="Saturasi warna"
                  value={settings.saturation}
                  min={-50}
                  max={50}
                  disabled={uploading}
                  onChange={(v) => update("saturation", v)}
                />
              </div>

              <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-white/40">
                Kualitas hasil
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["standard", "Standar", "Lebih cepat"],
                    ["high", "Tinggi", "Lebih detail, lebih lama"],
                  ] as const
                ).map(([v, t, d]) => (
                  <button
                    key={v}
                    onClick={() => update("quality", v)}
                    disabled={uploading}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      settings.quality === v
                        ? "border-fuchsia-400 bg-fuchsia-500/15"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{t}</div>
                    <div className="text-[11px] text-white/45">{d}</div>
                  </button>
                ))}
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3">
                <input
                  type="checkbox"
                  checked={settings.preview}
                  disabled={uploading}
                  onChange={(e) => update("preview", e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-fuchsia-500"
                />
                <span>
                  <span className="block text-sm font-medium text-white">Pratinjau 5 detik dulu</span>
                  <span className="block text-[11px] text-white/45">
                    Coba pengaturan pada potongan singkat sebelum memproses seluruh video.
                  </span>
                </span>
              </label>

              {error && (
                <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <button
                onClick={startUpload}
                disabled={!file || uploading}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading
                  ? `Mengunggah… ${uploadPct}%`
                  : file
                    ? "✨ Tingkatkan Kualitas Video"
                    : "Pilih video terlebih dahulu"}
              </button>
              {uploading && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-white">{current.originalName}</h3>
                  <p className="mt-0.5 text-xs text-white/40">
                    {new Date(current.createdAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <StatusBadge status={current.status} />
              </div>

              {current.settings.preview && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
                  Ini hasil pratinjau 5 detik pertama. Jika sudah puas, proses video penuh dengan pengaturan serupa.
                </div>
              )}

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Resolusi</dt>
                  <dd className="text-right text-white">
                    {resolutionLabel(current.srcWidth, current.srcHeight)}
                    <span className="mx-1.5 text-fuchsia-400">→</span>
                    {resolutionLabel(current.outWidth, current.outHeight)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Ukuran file</dt>
                  <dd className="text-white">
                    {formatBytes(current.inputSize)}
                    <span className="mx-1.5 text-fuchsia-400">→</span>
                    {formatBytes(current.outputSize)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/50">Durasi</dt>
                  <dd className="text-white">{formatDuration(current.duration)}</dd>
                </div>
                {current.fps ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/50">Frame rate</dt>
                    <dd className="text-white">{Math.round(current.fps)} fps</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap gap-1.5 text-[11px]">
                {[
                  `Noise ${current.settings.denoise}`,
                  `Tajam ${current.settings.sharpen}`,
                  `Kontras ${current.settings.contrast}`,
                  `Cerah ${current.settings.brightness}`,
                  `Warna ${current.settings.saturation}`,
                  current.settings.quality === "high" ? "Kualitas tinggi" : "Kualitas standar",
                ].map((t) => (
                  <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-white/60">
                    {t}
                  </span>
                ))}
              </div>

              {current.status === "done" && (
                <a
                  href={`/api/jobs/${current.id}/file?type=output&download=1`}
                  className="mt-6 block w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110"
                >
                  ⬇ Unduh Video Hasil
                </a>
              )}
              <button
                onClick={newVideo}
                className="mt-3 w-full rounded-2xl border border-white/15 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10"
              >
                + Proses video lain
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ------------------------- RIWAYAT ------------------------- */}
      <section className="mt-12" id="riwayat">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Riwayat Proyek</h2>
            <p className="text-sm text-white/40">Klik untuk melihat atau mengunduh kembali hasilnya.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">
            Belum ada video yang diproses.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {history.map((j) => (
              <div
                key={j.id}
                className={`group overflow-hidden rounded-2xl border bg-white/[0.04] transition ${
                  current?.id === j.id ? "border-fuchsia-400/70" : "border-white/10 hover:border-white/30"
                }`}
              >
                <button onClick={() => selectJob(j)} className="block w-full text-left">
                  <div className="relative aspect-video bg-black">
                    {j.status === "done" ? (
                      <video
                        src={`/api/jobs/${j.id}/file?type=output#t=0.5`}
                        preload="metadata"
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-800 to-slate-900 text-3xl">
                        {j.status === "failed" ? "⚠️" : "⏳"}
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <StatusBadge status={j.status} />
                    </div>
                    {j.status === "processing" && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                        <div className="h-full bg-fuchsia-500" style={{ width: `${j.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-white">{j.originalName}</p>
                    <p className="mt-0.5 text-[11px] text-white/45">
                      {j.srcHeight && j.outHeight
                        ? `${Math.min(j.srcWidth ?? 0, j.srcHeight)}p → ${Math.min(j.outWidth ?? 0, j.outHeight)}p`
                        : "—"}
                      {" · "}
                      {formatBytes(j.outputSize ?? j.inputSize)}
                    </p>
                  </div>
                </button>
                <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-[11px]">
                  <span className="text-white/35">{new Date(j.createdAt).toLocaleDateString("id-ID")}</span>
                  <button onClick={() => remove(j.id)} className="text-rose-300/80 transition hover:text-rose-300">
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
