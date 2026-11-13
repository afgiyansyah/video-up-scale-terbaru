import type { EnhanceSettings } from "@/db/schema";

export const DEFAULT_SETTINGS: EnhanceSettings = {
  targetShortSide: 1080,
  denoise: 30,
  sharpen: 40,
  contrast: 8,
  brightness: 0,
  saturation: 10,
  quality: "standard",
  preview: false,
};

export type Preset = {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  settings: Partial<EnhanceSettings>;
};

export const PRESETS: Preset[] = [
  {
    id: "auto",
    name: "Auto Jernih",
    desc: "Seimbang untuk kebanyakan video",
    emoji: "✨",
    settings: {
      targetShortSide: 1080,
      denoise: 30,
      sharpen: 40,
      contrast: 8,
      brightness: 0,
      saturation: 10,
    },
  },
  {
    id: "hd",
    name: "Upscale HD",
    desc: "Naikkan ke 1080p dengan detail tajam",
    emoji: "🔼",
    settings: {
      targetShortSide: 1080,
      denoise: 20,
      sharpen: 55,
      contrast: 4,
      brightness: 0,
      saturation: 5,
    },
  },
  {
    id: "4k",
    name: "Ultra 4K",
    desc: "Resolusi maksimal 2160p",
    emoji: "💎",
    settings: {
      targetShortSide: 2160,
      denoise: 25,
      sharpen: 60,
      contrast: 6,
      brightness: 0,
      saturation: 8,
    },
  },
  {
    id: "denoise",
    name: "Bersihkan Noise",
    desc: "Video gelap / berbintik / hasil kompres",
    emoji: "🧼",
    settings: {
      targetShortSide: 0,
      denoise: 75,
      sharpen: 30,
      contrast: 6,
      brightness: 6,
      saturation: 5,
    },
  },
  {
    id: "vivid",
    name: "Warna Cerah",
    desc: "Kontras & warna lebih hidup",
    emoji: "🌈",
    settings: {
      targetShortSide: 0,
      denoise: 15,
      sharpen: 35,
      contrast: 18,
      brightness: 2,
      saturation: 30,
    },
  },
];

export const RESOLUTIONS = [
  { value: 0, label: "Asli", sub: "Tanpa ubah" },
  { value: 720, label: "720p", sub: "HD" },
  { value: 1080, label: "1080p", sub: "Full HD" },
  { value: 1440, label: "1440p", sub: "2K" },
  { value: 2160, label: "2160p", sub: "4K" },
];

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
};

export function sanitizeSettings(input: unknown): EnhanceSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const allowed = [0, 720, 1080, 1440, 2160];
  const target = typeof o.targetShortSide === "number" ? o.targetShortSide : DEFAULT_SETTINGS.targetShortSide;
  return {
    targetShortSide: allowed.includes(target) ? target : DEFAULT_SETTINGS.targetShortSide,
    denoise: Math.round(clamp(o.denoise, 0, 100, DEFAULT_SETTINGS.denoise)),
    sharpen: Math.round(clamp(o.sharpen, 0, 100, DEFAULT_SETTINGS.sharpen)),
    contrast: Math.round(clamp(o.contrast, -50, 50, DEFAULT_SETTINGS.contrast)),
    brightness: Math.round(clamp(o.brightness, -50, 50, DEFAULT_SETTINGS.brightness)),
    saturation: Math.round(clamp(o.saturation, -50, 50, DEFAULT_SETTINGS.saturation)),
    quality: o.quality === "high" ? "high" : "standard",
    preview: o.preview === true,
  };
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return "-";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function resolutionLabel(w: number | null, h: number | null) {
  if (!w || !h) return "-";
  const short = Math.min(w, h);
  const tag =
    short >= 2160 ? "4K" : short >= 1440 ? "2K" : short >= 1080 ? "Full HD" : short >= 720 ? "HD" : "SD";
  return `${w}×${h} · ${tag}`;
}

/** Hitung dimensi keluaran (genap) berdasarkan sisi terpendek target — hanya memperbesar. */
export function computeOutputSize(w: number, h: number, targetShortSide: number) {
  const short = Math.min(w, h);
  if (!targetShortSide || targetShortSide <= short) return { width: w, height: h, scale: false };
  const ratio = targetShortSide / short;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * ratio), height: even(h * ratio), scale: true };
}
