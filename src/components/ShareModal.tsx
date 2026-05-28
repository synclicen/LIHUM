import React, { useState } from "react";
import { X, Copy, Check, QrCode, Download, ExternalLink, Share2, Globe, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ShareModalProps {
  project: {
    id: string;
    name: string;
    description?: string;
    displayMode?: "all" | "search";
  };
  onClose: () => void;
}

export default function ShareModal({ project, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [appUrl, setAppUrl] = useState<string>("");

  React.useEffect(() => {
    // Load public URL configuration from the backend dynamically
    fetch("/api/config")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Failed to get config");
      })
      .then((data) => {
        if (data && data.appUrl) {
          setAppUrl(data.appUrl);
        }
      })
      .catch((err) => console.warn("Could not fetch server-side APP_URL:", err));
  }, []);

  // Helper to determine the true external origin/hostname of the application
  const getShareOrigin = () => {
    let origin = "";
    if (appUrl) {
      origin = appUrl;
    } else {
      origin = window.location.origin;
    }

    // Clean trailing slash
    if (origin.endsWith("/")) {
      origin = origin.slice(0, -1);
    }

    // If it's the internal Google AI Studio frame/parent domain, use the public pre-release URL
    if (origin.includes("aistudio.google") || origin.includes("google.com")) {
      return "https://ais-pre-3yvnvgrxdpegnkjehn6gvj-381029775053.asia-southeast1.run.app";
    }

    // If it's a private development container URL (ais-dev-... is private/protected),
    // convert it to the public pre-release/production preview container URL (ais-pre-...)
    if (origin.includes("ais-dev-")) {
      return origin.replace("ais-dev-", "ais-pre-");
    }

    return origin;
  };

  // Construct the absolute share URL linked directly to this gallery
  const shareUrl = `${getShareOrigin()}?gallery=${project.id}`;

  // Stable QR Code Generator endpoint
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}&color=4c2a85&bgcolor=ffffff`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch (err) {
      console.warn("Navigator clipboard failed, using fallback:", err);
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed"; // Avoid scrolling to bottom
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else {
          throw new Error("Fallback copy command unsuccessful");
        }
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
        alert("Gagal menyalin secara otomatis. Silakan salin tautan berikut secara manual:\n\n" + shareUrl);
      }
    }
  };

  const handleDownloadQr = async () => {
    try {
      setDownloadingQr(true);
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const fileUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `QR_Code_LIHUM_${project.name.replace(/\s+/g, "_")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(fileUrl);
    } catch (err) {
      console.error("Gagal mengunduh QR Code:", err);
      // Fallback: open QR link in new tab
      window.open(qrUrl, "_blank");
    } finally {
      setDownloadingQr(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 15 }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="relative w-full max-w-md bg-[#F8F9FA] text-slate-800 rounded-3xl overflow-hidden shadow-2xl border-2 border-[#D4AF37]/35"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Luxury Top Header - Purple Banner */}
        <div className="bg-[#4C2A85] text-white p-6 pb-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-all"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>

          <span className="inline-flex items-center space-x-1.5 bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-2.5">
            <Share2 className="w-3 h-3 text-[#D4AF37]" />
            <span>Bagikan Galeri</span>
          </span>

          <h3 className="font-serif text-lg font-bold tracking-wide line-clamp-1 pr-6">
            {project.name}
          </h3>
          
          <p className="text-[11px] text-slate-200 mt-1 line-clamp-2 leading-relaxed">
            {project.description || "Silakan bagikan tautan atau kode QR galeri ini."}
          </p>

          {project.displayMode && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className={`text-[9px] px-2 py-0.5 rounded-full inline-flex items-center space-x-1 border font-bold ${
                project.displayMode === "all"
                  ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-200 border-amber-500/30"
              }`}>
                {project.displayMode === "all" ? (
                  <>
                    <Globe className="w-2.5 h-2.5 mr-0.5" />
                    <span>Galeri Publik</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-2.5 h-2.5 mr-0.5" />
                    <span>Mode Pencarian</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Modal content body */}
        <div className="p-6 md:p-8 space-y-6">
          
          {/* Link Copy Widget */}
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
              Tautan Langsung Galeri
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-slate-100/80 border border-slate-200 focus:outline-none rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-700 font-mono tracking-tight"
                />
                <button
                  onClick={() => window.open(shareUrl, "_blank")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-[#4C2A85] transition-colors"
                  title="Buka di Tab Baru"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handleCopy}
                className={`px-4.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wide shrink-0 transition-all flex items-center gap-1.5 ${
                  copied
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-300"
                    : "bg-[#4C2A85] hover:bg-[#5a329d] text-white shadow-md shadow-purple-900/15"
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* QR Code Presentation */}
          <div className="space-y-4 pt-1 border-t border-slate-200/60 flex flex-col items-center">
            <div className="text-center">
              <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
                Scan kode QR untuk membuka
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5">Pengunjung dapat memotret QR untuk menjelajah langsung di smartphone.</p>
            </div>

            {/* QR Wrapper frame */}
            <div className="relative p-4 bg-white rounded-2xl shadow-md border border-slate-200 flex items-center justify-center transition-transform hover:scale-101">
              <img
                src={qrUrl}
                alt={`QR Code ${project.name}`}
                className="w-44 h-44 pointer-events-none select-none"
              />
              <div className="absolute inset-0 border border-[#D4AF37]/10 rounded-2xl pointer-events-none" />
            </div>

            {/* Download QR Button */}
            <button
              onClick={handleDownloadQr}
              disabled={downloadingQr}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] text-[#4C2A85] hover:bg-[#dfbb66] font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingQr ? "Mengunduh..." : "Download File Gambar QR"}</span>
            </button>
          </div>

        </div>

        {/* Modal Decorative Footer */}
        <div className="bg-slate-100 p-4 text-center border-t border-slate-200/60 text-[10px] text-slate-400 font-mono tracking-wider uppercase">
          Fitur Berbagi Kreatif LIHUM
        </div>
      </motion.div>
    </div>
  );
}
