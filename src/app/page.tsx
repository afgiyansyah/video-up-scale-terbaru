import Workspace from "@/components/Workspace";

const FEATURES = [
  { icon: "🔼", title: "Upscale hingga 4K", desc: "Perbesar resolusi dengan interpolasi Lanczos berkualitas tinggi." },
  { icon: "🧼", title: "Bersihkan noise", desc: "Kurangi bintik dan blok kompresi pada video hasil editan." },
  { icon: "🔍", title: "Detail lebih tajam", desc: "Pertegas tepi dan tekstur agar video tampak jernih." },
  { icon: "🌈", title: "Warna & kontras", desc: "Atur kecerahan, kontras, dan saturasi dalam satu langkah." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-lg shadow-lg shadow-fuchsia-500/30">
            ✨
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Jernih<span className="text-fuchsia-400">Klip</span>
          </span>
        </div>
        <a
          href="#riwayat"
          className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
        >
          Riwayat
        </a>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-8 pt-6 text-center sm:px-6">
        <span className="inline-block rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-1 text-xs font-medium text-fuchsia-200">
          Peningkat kualitas video online
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
          Video buram jadi{" "}
          <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-violet-400 bg-clip-text text-transparent">
            jernih & tajam
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-white/60 sm:text-lg">
          Unggah klip atau hasil editan Anda, pilih preset, lalu bandingkan sebelum dan sesudah secara langsung.
          Hasil siap diunduh dalam format MP4.
        </p>
      </section>

      <Workspace />

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
              <p className="mt-1 text-sm text-white/50">{f.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-white/30">
          Peningkatan menggunakan filter ffmpeg (Lanczos upscale, hqdn3d, unsharp, eq). Hasil terbaik pada video
          dengan detail asli yang cukup.
        </p>
      </section>
    </main>
  );
}
