"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  SwitchCamera,
  Image as ImageIcon,
  Upload,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  preparePhotoForUpload,
  readFileAsDataURL,
} from "@/lib/frame-compositing";

// ── Constants ──
// Server enforces max 15 photos per 10 min per IP. We also cap the session.
const PHOTO_QUALITY = 0.92;
const MAX_PHOTOS_PER_SESSION = 15;

type FacingMode = "environment" | "user";

interface GalleryInfo {
  id: string;
  name: string;
  allowVisitorUpload: boolean;
}

interface FrameConfig {
  enabled: boolean;
  frameImage: string;
}

type LoadState = "loading" | "ready" | "error" | "forbidden";

export default function VisitorUploadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C061A] text-slate-100 p-6">
          <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37] mb-4" />
          <p className="text-slate-400">Memuat…</p>
        </div>
      }
    >
      <VisitorUploadContent />
    </Suspense>
  );
}

function VisitorUploadContent() {
  const searchParams = useSearchParams();
  const galleryId = searchParams.get("gallery") || "";

  // ── State ──
  const [gallery, setGallery] = useState<GalleryInfo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");

  const [frameConfig, setFrameConfig] = useState<FrameConfig | null>(null);
  const [frameLoading, setFrameLoading] = useState(true);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");

  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    count: number;
  } | null>(null);

  // ── Refs ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch gallery info ──
  useEffect(() => {
    if (!galleryId) {
      setLoadState("error");
      setLoadError("Link tidak valid — ID galeri tidak ditemukan.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(galleryId)}/visitor-upload`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadState("error");
          setLoadError(data.error || "Galeri tidak ditemukan.");
          return;
        }
        setGallery(data);
        if (!data.allowVisitorUpload) {
          setLoadState("forbidden");
        } else {
          setLoadState("ready");
        }
      } catch (err: any) {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(err.message || "Gagal memuat informasi galeri.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [galleryId]);

  // ── Fetch frame config (once on mount) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/settings/visitor-frame`);
        const data = await res.json();
        if (cancelled) return;
        setFrameConfig({
          enabled: !!data.enabled,
          frameImage: data.frameImage || "",
        });
      } catch {
        if (cancelled) return;
        // Non-fatal — assume no frame.
        setFrameConfig({ enabled: false, frameImage: "" });
      } finally {
        if (!cancelled) setFrameLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Camera cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  // ── Camera helpers ──
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraStarting(true);
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      let msg = "Gagal mengakses kamera.";
      if (err?.name === "NotAllowedError") {
        msg =
          "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.";
      } else if (err?.name === "NotFoundError") {
        msg = "Kamera tidak ditemukan.";
      } else if (err?.name === "NotReadableError") {
        msg = "Kamera sedang digunakan aplikasi lain.";
      } else if (err?.name === "OverconstrainedError") {
        msg =
          "Kamera tidak mendukung resolusi yang diminta. Coba kamera lain.";
      }
      setCameraError(msg);
      setCameraActive(false);
    } finally {
      setCameraStarting(false);
    }
  }, [facingMode]);

  const switchCamera = useCallback(async () => {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (cameraActive) {
      // Restart with new facing mode
      setCameraActive(false);
      // small delay to release previous stream
      setTimeout(() => {
        startCameraWith(next);
      }, 150);
    }
    function startCameraWith(mode: FacingMode) {
      setCameraError("");
      setCameraStarting(true);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
          setCameraActive(true);
        } catch (err: any) {
          let msg = "Gagal mengakses kamera.";
          if (err?.name === "NotAllowedError")
            msg =
              "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.";
          else if (err?.name === "NotFoundError") msg = "Kamera tidak ditemukan.";
          else if (err?.name === "NotReadableError")
            msg = "Kamera sedang digunakan aplikasi lain.";
          setCameraError(msg);
          setCameraActive(false);
        } finally {
          setCameraStarting(false);
        }
      })();
    }
  }, [facingMode, cameraActive]);

  // ── Capture a photo from the video stream ──
  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setCameraError("Video belum siap. Tunggu beberapa detik lalu coba lagi.");
      return;
    }
    if (capturedPhotos.length >= MAX_PHOTOS_PER_SESSION) {
      setCameraError(
        `Anda telah mencapai batas ${MAX_PHOTOS_PER_SESSION} foto per sesi. Upload dulu sebelum menambah lagi.`
      );
      return;
    }

    setProcessing(true);
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Use a max dimension of 1920 for raw capture, then preparePhotoForUpload
      // will resize down to 1600px.
      const maxDim = 1920;
      const scale = Math.min(maxDim / vw, maxDim / vh, 1);
      const cw = Math.round(vw * scale);
      const ch = Math.round(vh * scale);

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context tidak tersedia");

      // Mirror for selfie camera for natural feel
      if (facingMode === "user") {
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, cw, ch);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const rawDataUrl = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
      const composited = await preparePhotoForUpload(
        rawDataUrl,
        frameConfig?.enabled ? frameConfig.frameImage : null
      );
      setCapturedPhotos((prev) => [...prev, composited]);
    } catch (err: any) {
      setCameraError(err.message || "Gagal mengambil foto.");
    } finally {
      setProcessing(false);
    }
  }, [capturedPhotos.length, facingMode, frameConfig]);

  // ── Handle file upload ──
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setProcessing(true);
      setCameraError("");
      try {
        const remaining = MAX_PHOTOS_PER_SESSION - capturedPhotos.length;
        const toProcess = Array.from(files).slice(0, remaining);

        if (Array.from(files).length > remaining) {
          setCameraError(
            `Maksimal ${MAX_PHOTOS_PER_SESSION} foto per sesi. Hanya ${remaining} foto pertama yang diproses.`
          );
        }

        const results: string[] = [];
        for (const file of toProcess) {
          if (!file.type.startsWith("image/")) continue;
          const dataUrl = await readFileAsDataURL(file);
          const composited = await preparePhotoForUpload(
            dataUrl,
            frameConfig?.enabled ? frameConfig.frameImage : null
          );
          results.push(composited);
        }
        if (results.length > 0) {
          setCapturedPhotos((prev) => [...prev, ...results]);
        }
      } catch (err: any) {
        setCameraError(err.message || "Gagal memproses file.");
      } finally {
        setProcessing(false);
        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [capturedPhotos.length, frameConfig]
  );

  // ── Remove a photo ──
  const removePhoto = useCallback((index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Upload all photos ──
  const handleUpload = useCallback(async () => {
    if (capturedPhotos.length === 0 || !galleryId) return;
    setUploading(true);
    setUploadResult(null);
    setCameraError("");
    try {
      const payload = {
        photos: capturedPhotos.map((dataUrl, i) => {
          const base64Data = dataUrl.split(",")[1] || "";
          return {
            base64Data,
            mimeType: "image/jpeg",
            fileName: `photo-${Date.now()}-${i + 1}.jpg`,
          };
        }),
      };

      const res = await fetch(
        `/api/projects/${encodeURIComponent(galleryId)}/visitor-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengupload foto.");
      }
      setUploadResult({
        success: true,
        message:
          data.message ||
          `${capturedPhotos.length} foto berhasil diupload!`,
        count: data.uploaded || capturedPhotos.length,
      });
      setCapturedPhotos([]);
      // Stop camera if active — success state takes over
      stopCameraStream();
    } catch (err: any) {
      setUploadResult({
        success: false,
        message: err.message || "Gagal mengupload foto.",
        count: 0,
      });
    } finally {
      setUploading(false);
    }
  }, [capturedPhotos, galleryId, stopCameraStream]);

  const resetSuccess = () => setUploadResult(null);

  // ── Render: error / forbidden states ──
  if (loadState === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C061A] text-slate-100 p-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37] mb-4" />
        <p className="text-slate-400">Memuat galeri…</p>
      </div>
    );
  }

  if (loadState === "error" || loadState === "forbidden") {
    return (
      <div className="min-h-screen flex flex-col bg-[#0C061A] text-slate-100">
        <Header galleryName={null} />
        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-5"
          >
            <AlertCircle className="w-8 h-8 text-red-400" />
          </motion.div>
          <h1 className="text-xl font-semibold text-slate-100 mb-2">
            {loadState === "forbidden"
              ? "Upload tidak diaktifkan"
              : "Galeri tidak ditemukan"}
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            {loadState === "forbidden"
              ? "Galeri ini tidak mengizinkan upload langsung dari pengunjung. Hubungi admin untuk informasi lebih lanjut."
              : loadError ||
                "Link mungkin sudah tidak berlaku. Hubungi pembuat galeri untuk link terbaru."}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4AF37] text-[#0C061A] font-semibold text-sm hover:bg-[#E4C247] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda
          </a>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Render: main UI ──
  const galleryName = gallery?.name || "Galeri";
  const frameEnabled = !!frameConfig?.enabled && !!frameConfig?.frameImage;

  return (
    <div className="min-h-screen flex flex-col bg-[#0C061A] text-slate-100">
      <Header galleryName={galleryName} />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pb-32 pt-4">
        {/* Success state */}
        <AnimatePresence>
          {uploadResult?.success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-5 rounded-2xl bg-[#120A21] border border-[#D4AF37]/25"
            >
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-14 h-14 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center mb-4"
                >
                  <CheckCircle2 className="w-8 h-8 text-[#D4AF37]" />
                </motion.div>
                <h2 className="text-lg font-semibold text-slate-100 mb-1">
                  Upload Berhasil!
                </h2>
                <p className="text-slate-400 text-sm mb-5">{uploadResult.message}</p>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <a
                    href={`/?gallery=${encodeURIComponent(galleryId)}`}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4AF37] text-[#0C061A] font-semibold text-sm hover:bg-[#E4C247] transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Lihat Galeri
                  </a>
                  <button
                    type="button"
                    onClick={resetSuccess}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-transparent border border-[#D4AF37]/30 text-slate-200 font-medium text-sm hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    Tambah Foto Lagi
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload error toast */}
        <AnimatePresence>
          {uploadResult && !uploadResult.success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{uploadResult.message}</p>
                <button
                  type="button"
                  onClick={resetSuccess}
                  className="mt-2 text-xs underline text-red-300 hover:text-red-100"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera section */}
        <section
          aria-label="Pengambilan foto via kamera"
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#D4AF37]" />
              Ambil Foto
            </h2>
            {capturedPhotos.length > 0 && (
              <span className="text-xs text-slate-400">
                {capturedPhotos.length}/{MAX_PHOTOS_PER_SESSION} foto
              </span>
            )}
          </div>

          <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#120A21] border border-[#D4AF37]/25">
            {/* Video preview */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${
                cameraActive ? "opacity-100" : "opacity-0"
              } ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              aria-label="Preview kamera langsung"
            />

            {/* Frame overlay — positioned over the video to give a live preview */}
            {frameEnabled && cameraActive && (
              <img
                src={frameConfig!.frameImage}
                alt="Bingkai foto"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                aria-hidden="true"
              />
            )}

            {/* Idle / placeholder overlay */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                {frameLoading ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                    <p className="text-xs text-slate-400">Memuat bingkai…</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
                      <Camera className="w-7 h-7 text-[#D4AF37]" />
                    </div>
                    <p className="text-sm text-slate-400 max-w-[220px]">
                      Klik tombol di bawah untuk mulai kamera dan ambil foto.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Processing overlay */}
            {processing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 z-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                <p className="text-xs text-slate-200">Memproses foto…</p>
              </div>
            )}

            {/* Switch camera button (only when active) */}
            {cameraActive && !processing && (
              <button
                type="button"
                onClick={switchCamera}
                className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-slate-100 hover:bg-black/70 transition-colors"
                aria-label="Ganti kamera (depan/belakang)"
                title="Ganti kamera"
              >
                <SwitchCamera className="w-5 h-5" />
                <span className="sr-only">Ganti kamera</span>
              </button>
            )}
          </div>

          {/* Camera error */}
          {cameraError && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Camera controls */}
          <div className="mt-4 flex items-center justify-center gap-4">
            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={cameraStarting || processing}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4AF37] text-[#0C061A] font-semibold text-sm hover:bg-[#E4C247] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {cameraStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyalakan…
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Mulai Kamera
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={stopCameraStream}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-transparent border border-slate-600 text-slate-300 font-medium text-sm hover:bg-slate-800/50 transition-colors"
                  aria-label="Matikan kamera"
                >
                  <CameraOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={processing || capturedPhotos.length >= MAX_PHOTOS_PER_SESSION}
                  aria-label="Ambil foto"
                  title="Ambil foto"
                  className="w-16 h-16 rounded-full bg-[#D4AF37] border-4 border-[#D4AF37]/30 flex items-center justify-center text-[#0C061A] hover:bg-[#E4C247] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                  <Camera className="w-7 h-7" />
                  <span className="sr-only">Ambil foto</span>
                </button>
                <div className="w-[64px]" aria-hidden="true" />
              </>
            )}
          </div>
        </section>

        {/* File upload alternative */}
        <section aria-label="Upload dari galeri perangkat" className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-[#D4AF37]/15" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              atau
            </span>
            <div className="flex-1 h-px bg-[#D4AF37]/15" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Pilih foto dari galeri"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing || capturedPhotos.length >= MAX_PHOTOS_PER_SESSION}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#120A21] border border-[#D4AF37]/25 text-slate-200 font-medium text-sm hover:bg-[#1A0F2E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
            Pilih dari Galeri
          </button>
        </section>

        {/* Captured photos preview */}
        {capturedPhotos.length > 0 && (
          <section aria-label="Foto yang akan diupload" className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300">
                Foto Tersimpan ({capturedPhotos.length})
              </h2>
              <button
                type="button"
                onClick={() => setCapturedPhotos([])}
                className="text-xs text-slate-400 hover:text-red-300 transition-colors inline-flex items-center gap-1"
                aria-label="Hapus semua foto"
              >
                <Trash2 className="w-3 h-3" />
                Hapus Semua
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1 lihum-scroll">
              {capturedPhotos.map((photo, i) => (
                <motion.div
                  key={`${i}-${photo.slice(0, 32)}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative aspect-square rounded-lg overflow-hidden bg-[#120A21] border border-[#D4AF37]/20 group"
                >
                  <img
                    src={photo}
                    alt={`Foto ${i + 1} dengan bingkai`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white opacity-90 hover:bg-red-500/80 transition-colors"
                    aria-label={`Hapus foto ${i + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="sr-only">Hapus foto {i + 1}</span>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-gradient-to-t from-black/80 to-transparent">
                    <span className="text-[10px] text-slate-200 font-medium">
                      #{i + 1}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Rate limit warning */}
        {capturedPhotos.length >= MAX_PHOTOS_PER_SESSION - 2 &&
          capturedPhotos.length < MAX_PHOTOS_PER_SESSION && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Mendekati batas {MAX_PHOTOS_PER_SESSION} foto per sesi. Upload
                dulu sebelum menambah foto baru.
              </span>
            </div>
          )}
      </main>

      {/* Sticky upload footer */}
      <AnimatePresence>
        {capturedPhotos.length > 0 && !uploadResult?.success && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="sticky bottom-0 left-0 right-0 z-30 bg-[#0C061A]/95 backdrop-blur-lg border-t border-[#D4AF37]/20 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="max-w-md mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">Siap diupload</p>
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {capturedPhotos.length} foto
                  {frameEnabled && (
                    <span className="text-[#D4AF37]"> • dengan bingkai</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || processing}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4AF37] text-[#0C061A] font-semibold text-sm hover:bg-[#E4C247] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengupload…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload {capturedPhotos.length} Foto
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}

// ── Header sub-component ──
function Header({ galleryName }: { galleryName: string | null }) {
  return (
    <header className="sticky top-0 z-20 bg-[#0C061A]/95 backdrop-blur-lg border-b border-[#D4AF37]/15">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <a
          href="/"
          aria-label="Kembali ke beranda"
          className="w-9 h-9 rounded-full bg-[#120A21] border border-[#D4AF37]/25 flex items-center justify-center text-slate-200 hover:bg-[#1A0F2E] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="sr-only">Kembali ke beranda</span>
        </a>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[#D4AF37] font-medium uppercase tracking-wider">
            Upload Pengunjung
          </p>
          <h1 className="text-sm font-semibold text-slate-100 truncate">
            {galleryName || "Galeri"}
          </h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
        </div>
      </div>
    </header>
  );
}

// ── Footer sub-component ──
function Footer() {
  return (
    <footer className="mt-auto px-4 py-4 border-t border-[#D4AF37]/10">
      <div className="max-w-md mx-auto text-center">
        <p className="text-[11px] text-slate-500">
          LIHUM Photo Gallery • Upload Pengunjung
        </p>
      </div>
    </footer>
  );
}
