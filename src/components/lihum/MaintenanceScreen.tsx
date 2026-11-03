"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Wrench, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";

interface MaintenanceScreenProps {
  message?: string;
  /** When provided, shows a "Coba Lagi" button that reloads the page. */
  onRetry?: () => void;
}

/**
 * MaintenanceScreen — full-screen notice shown to non-admin visitors when
 * maintenance mode is enabled by an admin.
 *
 * Styled to match the LIHUM dark theme (gold accent #D4AF37, deep purple
 * background #0C061A). The admin's custom message is displayed prominently.
 * A retry button lets visitors check if maintenance has ended.
 *
 * Admins never see this screen — page.tsx checks maintenance status and
 * always renders the normal UI for authenticated admin/manager users.
 */
export default function MaintenanceScreen({
  message,
  onRetry,
}: MaintenanceScreenProps) {
  const [retrying, setRetrying] = useState(false);

  // Show current time so visitors know the page is live, not cached.
  // Lazy initializer — runs once on mount, no re-render needed.
  const [now] = useState(() =>
    new Date().toLocaleString("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
    })
  );

  const handleRetry = () => {
    setRetrying(true);
    if (onRetry) {
      onRetry();
    } else {
      // Default: reload the page after a short delay.
      setTimeout(() => window.location.reload(), 800);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#0C061A] via-[#120A21] to-[#0C061A] flex flex-col items-center justify-center p-6 text-center overflow-hidden">
      {/* Animated background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
      >
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-violet-700/5 blur-3xl" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 max-w-xl w-full"
      >
        {/* Maintenance icon with pulse */}
        <motion.div
          className="mx-auto mb-8 relative"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="relative w-28 h-28 mx-auto">
            {/* Pulsing ring */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/40"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border-2 border-[#D4AF37]/20"
              animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0, 0.4] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
            />
            {/* Center icon */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#1F0F3D]/60 border border-[#D4AF37]/40 flex items-center justify-center">
              <motion.div
                animate={{ rotate: [0, 8, -8, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Wrench className="w-10 h-10 text-[#D4AF37]" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="font-serif text-4xl sm:text-5xl font-bold text-[#D4AF37] mb-3 tracking-tight"
        >
          Mode Pemeliharaan
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-slate-300 text-sm sm:text-base mb-6"
        >
          Aplikasi sedang dalam pemeliharaan sistem.
          <br />
          Hanya admin yang dapat mengakses saat ini.
        </motion.p>

        {/* Custom message from admin */}
        {message && message.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="bg-[#1F0F3D]/60 border border-[#D4AF37]/25 rounded-2xl p-5 mb-6 backdrop-blur-sm"
          >
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div className="text-left flex-1">
                <p className="text-[10px] uppercase tracking-widest text-[#D4AF37]/70 font-bold mb-1.5">
                  Pesan dari Admin
                </p>
                <p className="text-slate-100 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                  {message}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Admin access hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-6"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Admin? Login untuk mengakses aplikasi</span>
        </motion.div>

        {/* Retry button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/40 text-[#D4AF37] font-bold text-sm hover:bg-[#D4AF37]/20 hover:border-[#D4AF37]/60 transition-all disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`}
          />
          {retrying ? "Memeriksa..." : "Coba Lagi"}
        </motion.button>

        {/* Footer timestamp */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="text-[10px] text-slate-600 mt-8 font-mono"
        >
          {now}
        </motion.p>
      </motion.div>

      {/* Brand mark */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-700 font-mono tracking-widest"
      >
        LIHUM · Lihat, Unduh Mandiri
      </motion.div>
    </div>
  );
}
