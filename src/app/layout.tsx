import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "LIHUM: Lihat dan Unduh Mandiri",
  description:
    "LIHUM (Lihat untuk Umum): Galeri foto tempat elegan dengan integrasi Google Drive, pencarian nama foto, dan fitur unduhan mandiri bagi publik.",
  keywords: [
    "LIHUM",
    "galeri foto",
    "Google Drive",
    "unduh mandiri",
    "publik",
    "Fajrianor",
  ],
  authors: [{ name: "Fajrianor" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "LIHUM: Lihat dan Unduh Mandiri",
    description:
      "Media berbagi foto kegiatan, pengunjung bebas memilih dan mengunduh foto langsung di halaman galeri yang dibagikan secara mandiri.",
    siteName: "LIHUM",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased bg-[#0C061A] text-slate-100 min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
