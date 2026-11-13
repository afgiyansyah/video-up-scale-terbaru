"use client";

import { useRef, useState } from "react";

type Props = {
  originalSrc: string;
  enhancedSrc: string;
  width: number;
  height: number;
};

const fmt = (s: number) => {
  const t = Math.floor(s || 0);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
};

export default function CompareSlider({ originalSrc, enhancedSrc, width, height }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const orig = useRef<HTMLVideoElement>(null);
  const enh = useRef<HTMLVideoElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  const move = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  const toggle = () => {
    const e = enh.current;
    const o = orig.current;
    if (!e || !o) return;
    if (e.paused) {
      o.currentTime = e.currentTime;
      void e.play();
      void o.play();
    } else {
      e.pause();
      o.pause();
    }
  };

  const seek = (t: number) => {
    if (enh.current) enh.current.currentTime = t;
    if (orig.current) orig.current.currentTime = t;
    setTime(t);
  };

  return (
    <div className="w-full">
      <div
        ref={wrap}
        className="relative mx-auto w-full select-none overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ aspectRatio: `${width} / ${height}`, maxHeight: "68vh", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <video
          ref={enh}
          src={enhancedSrc}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          loop
          muted={muted}
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setTime(t);
            const o = orig.current;
            if (o && Math.abs(o.currentTime - t) > 0.15) o.currentTime = t;
          }}
        />
        <video
          ref={orig}
          src={originalSrc}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          Asli
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white shadow">
          ✨ Jernih
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.6)]"
          style={{ left: `${pos}%` }}
        >
          <div className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-sm font-bold text-slate-900 shadow-lg">
            ⇆
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={toggle}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label={playing ? "Jeda" : "Putar"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="w-10 text-xs tabular-nums text-white/60">{fmt(time)}</span>
        <input
          type="range"
          min={0}
          max={dur || 1}
          step={0.05}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-fuchsia-500"
          aria-label="Posisi video"
        />
        <span className="w-10 text-right text-xs tabular-nums text-white/60">{fmt(dur)}</span>
        <button
          onClick={() => setMuted((m) => !m)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-white/40">
        Geser garis putih untuk membandingkan video asli (kiri) dan hasil (kanan)
      </p>
    </div>
  );
}
