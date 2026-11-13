import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "JernihKlip — Penjernih & Peningkat Resolusi Video",
  description:
    "Tingkatkan resolusi hingga 4K, kurangi noise, dan pertajam detail video hasil editan atau klip Anda secara online.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-[#0b0a14] text-white antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
          <div className="absolute -right-40 top-40 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
