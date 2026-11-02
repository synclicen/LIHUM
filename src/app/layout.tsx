import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Google Drive Push Notifications require the webhook domain to be verified
// in Google Search Console. The admin verifies ownership by adding a meta
// tag with a verification token (provided by Search Console) to the HTML.
// Set GOOGLE_SITE_VERIFICATION in wrangler.jsonc vars or env to inject it.
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION || "";

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
  // Injected only when GOOGLE_SITE_VERIFICATION env var is set.
  // Required for Google Drive Push Notifications (domain verification step).
  ...(googleSiteVerification
    ? {
        verification: {
          google: googleSiteVerification,
        },
      }
    : {}),
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
