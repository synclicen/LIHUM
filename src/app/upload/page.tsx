"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ImageIcon,
  CloudUpload,
  RefreshCw,
  SwitchCamera,
  Trash2,
  ChevronLeft,
} from "lucide-react";

interface UploadPhoto {
  base64Data: string; // pure base64 (no data: prefix)
  mimeType: string;
  fileName: string;
  preview: string; // data URL for <img src>
  sizeKB: number;
}

const MAX_PHOTOS = 5;
const MAX_DIMENSION = 1600; // px — longest edge after resize
const JPEG_QUALITY = 0.82;

export default function UploadPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0C061A] flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
        </div>
      }
    >
      <UploadPage />
    </Suspense>
  );
}

/**
 * Resize & re-encode an image file client-side so the upload payload stays
 * small (typically 150-400KB per photo). PNG with transparency stays PNG;
 * everything else → JPEG.
 */
async function resizeImage(file: File): Promise<UploadPhoto | null> {
  if (!file.type.startsWith("image/")) return null;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  }).catch(() => "");

  if (!dataUrl) return null;

  const img = new window.Image();
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });
  img.src = dataUrl;
  const didLoad = await loaded;

  if (!didLoad) {
    // Can't decode (e.g. HEIC without browser support) — send original bytes.
    const base64Data = dataUrl.split(",")[1] || "";
    return {
      base64Data,
      mimeType: file.type || "image/jpeg",
      fileName: file.name,
      preview: dataUrl,
      sizeKB: Math.ceil((base64Data.length * 3) / 4 / 1024),
    };
  }

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const base64Data = dataUrl.split(",")[1] || "";
    return {
      base64Data,
      mimeType: file.type || "image/jpeg",
      fileName: file.name,
      preview: dataUrl,
      sizeKB: Math.ceil((base64Data.length * 3) / 4 / 1024),
    };
  }
  ctx.drawImage(img, 0, 0, width, height);

  let outMimeType = "image/jpeg";
  let outDataUrl: string;
  if (file.type === "image/png") {
    outMimeType = "image/png";
    outDataUrl = canvas.toDataURL("image/png");
  } else {
    outDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }
  const base64Data = outDataUrl.split(",")[1] || "";

  const originalExt = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "jpg";
  const ext = outMimeType === "image/png" ? (originalExt === "png" ? "png" : "jpg") : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  const fileName = `${baseName}.${ext}`;

  return {
    base64Data,
    mimeType: outMimeType,
    fileName,
    preview: outDataUrl,
    sizeKB: Math.ceil((base64Data.length * 3) / 4 / 1024),
  };
}

function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const galleryId = searchParams.get("gallery") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(false);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraStarting, setCameraStarting] = useState(false);

  // Photos + upload state
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ── Load gallery info ──
  useEffect(() => {
    if (!galleryId) {
      setError("Gallery ID tidak ditemukan di URL.");
      setLoading(false);
      return;
    }
    fetch(`/api/projects/${galleryId}/visitor-upload`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else if (!data.allowVisitorUpload) {
          setError("Galeri ini tidak mengizinkan upload dari pengunjung.");
        } else {
          setProjectName(data.name || "Galeri");
          setAllowed(true);
        }
      })
      .catch(() => setError("Gagal memuat data galeri."))
      .finally(() => setLoading(false));
  }, [galleryId]);

  // ── Camera: start stream ──
  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraStarting(true);
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error("Camera error:", err);
      let msg = "Tidak dapat mengakses kamera.";
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        msg = "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser, lalu coba lagi.";
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        msg = "Kamera tidak ditemukan di perangkat ini. Gunakan tombol 'Pilih File' sebagai gantinya.";
      } else if (err?.name === "NotReadableError") {
        msg = "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
      }
      setCameraError(msg);
      setCameraActive(false);
    } finally {
      setCameraStarting(false);
    }
  }, [facingMode]);

  // ── Camera: stop stream ──
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Capture photo from camera ──
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) return;
    if (photos.length >= MAX_PHOTOS) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror if front camera (user-facing) for natural selfie feel
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Now resize to max dimension + compress
    const resizedCanvas = document.createElement("canvas");
    let { width, height } = canvas;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width >= height) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
    }
    resizedCanvas.width = width;
    resizedCanvas.height = height;
    const rctx = resizedCanvas.getContext("2d");
    if (!rctx) return;
    rctx.drawImage(canvas, 0, 0, width, height);

    const outDataUrl = resizedCanvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64Data = outDataUrl.split(",")[1] || "";
    const fileName = `${projectName.replace(/\s+/g, "_")}-visitor-${Date.now()}.jpg`;

    setPhotos((prev) => [
      ...prev,
      {
        base64Data,
        mimeType: "image/jpeg",
        fileName,
        preview: outDataUrl,
        sizeKB: Math.ceil((base64Data.length * 3) / 4 / 1024),
      },
    ]);
  }, [photos.length, facingMode, projectName]);

  // ── Switch camera (front ↔ back) ──
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    // startCamera will re-run via the effect below
  }, []);

  // Restart camera when facingMode changes (only if camera is active).
  // startCamera depends on facingMode (useCallback), so it changes identity
  // when the user switches cameras — re-firing this effect exactly then.
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    }
  }, [facingMode, cameraActive, startCamera]);

  // ── File picker ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setProcessing(true);
    setError("");

    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newPhotos: UploadPhoto[] = [];

    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 15 * 1024 * 1024) {
        setError(`File "${file.name}" terlalu besar (maks 15MB sebelum kompresi).`);
        continue;
      }
      const resized = await resizeImage(file);
      if (resized) newPhotos.push(resized);
    }

    if (newPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...newPhotos]);
    }
    setProcessing(false);
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Upload to server ──
  const handleUpload = async () => {
    if (photos.length === 0) return;
    setUploading(true);
    setError("");
    stopCamera();

    try {
      const res = await fetch(`/api/projects/${galleryId}/visitor-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos: photos.map((p) => ({
            base64Data: p.base64Data,
            mimeType: p.mimeType,
            fileName: p.fileName,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setUploadResult({
          success: true,
          message: data.message || `${data.uploaded} foto berhasil diupload!`,
        });
        setPhotos([]);
      } else {
        setError(data.error || "Gagal upload foto. Silakan coba lagi.");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal terhubung ke server.");
    } finally {
      setUploading(false);
    }
  };

  // ── Render: loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C061A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  // ── Render: error (not allowed) ──
  if ((error && !allowed) || !allowed) {
    return (
      <div className="min-h-screen bg-[#0C061A] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-sm">{error || "Upload tidak diizinkan untuk galeri ini."}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#4C2A85] text-white text-xs rounded-xl hover:bg-[#5a329d] transition-all"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // ── Render: success ──
  if (uploadResult?.success) {
    return (
      <div className="min-h-screen bg-[#0C061A] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
          <h2 className="text-lg font-serif font-bold text-white">Upload Berhasil!</h2>
          <p className="text-sm text-slate-400">{uploadResult.message}</p>
          <p className="text-xs text-slate-500">
            Foto akan ditinjau admin lalu ditambahkan ke galeri.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => router.push(`/?gallery=${galleryId}`)}
              className="px-4 py-2 bg-[#D4AF37] text-[#4C2A85] text-xs font-bold rounded-xl hover:bg-[#dfbb66] transition-all"
            >
              Lihat Galeri
            </button>
            <button
              onClick={() => {
                setUploadResult(null);
                setPhotos([]);
              }}
              className="px-4 py-2 bg-[#4C2A85] text-white text-xs rounded-xl hover:bg-[#5a329d] transition-all"
            >
              Upload Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: main upload UI ──
  return (
    <div className="min-h-screen bg-[#0C061A] text-slate-100 flex flex-col">
      {/* Header */}
      <div className="text-center space-y-2 pt-4 pb-2 px-4">
        <div className="w-12 h-12 bg-[#D4AF37] rounded-xl flex items-center justify-center mx-auto">
          <Camera className="w-6 h-6 text-[#4C2A85]" />
        </div>
        <h1 className="text-xl font-serif font-bold text-white">Upload Foto</h1>
        <p className="text-xs text-slate-400">
          Galeri: <strong className="text-[#D4AF37]">{projectName}</strong>
        </p>
      </div>

      <div className="flex-1 w-full max-w-lg mx-auto px-4 pb-4 space-y-3">
        {/* Camera viewfinder (only when active) */}
        {cameraActive && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] shadow-2xl border-2 border-[#D4AF37]/30">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
            />
            {/* Capture button overlay */}
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
              <button
                onClick={switchCamera}
                className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 text-white flex items-center justify-center hover:bg-black/80 transition-all"
                title="Ganti kamera (depan/belakang)"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
              <button
                onClick={handleCapture}
                disabled={photos.length >= MAX_PHOTOS}
                className="w-16 h-16 rounded-full bg-white border-4 border-[#D4AF37] flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
                title="Ambil foto"
              >
                <div className="w-12 h-12 rounded-full bg-[#D4AF37] flex items-center justify-center">
                  <Camera className="w-6 h-6 text-[#4C2A85]" />
                </div>
              </button>
              <button
                onClick={stopCamera}
                className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 text-white flex items-center justify-center hover:bg-red-500/40 transition-all"
                title="Tutup kamera"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Counter overlay */}
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded-full">
              {photos.length}/{MAX_PHOTOS}
            </div>
          </div>
        )}

        {/* Camera controls (when inactive) */}
        {!cameraActive && photos.length < MAX_PHOTOS && (
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={startCamera}
              disabled={cameraStarting}
              className="flex flex-col items-center gap-2 py-6 bg-[#4C2A85] border border-[#D4AF37]/30 rounded-xl hover:bg-[#5a329d] transition-all disabled:opacity-50"
            >
              {cameraStarting ? (
                <Loader2 className="w-7 h-7 text-[#D4AF37] animate-spin" />
              ) : (
                <Camera className="w-7 h-7 text-[#D4AF37]" />
              )}
              <span className="text-sm font-bold text-white">
                {cameraStarting ? "Menyalakan kamera..." : "Buka Kamera"}
              </span>
              <span className="text-[10px] text-slate-400">Ambil foto langsung</span>
            </button>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <div className="flex-1 h-px bg-slate-700/50" />
              <span>ATAU</span>
              <div className="flex-1 h-px bg-slate-700/50" />
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 py-4 bg-[#120A21] border border-[#D4AF37]/30 rounded-xl hover:bg-[#1C0F32] transition-all"
            >
              <ImageIcon className="w-6 h-6 text-[#D4AF37]" />
              <span className="text-sm font-bold text-white">Pilih File</span>
              <span className="text-[10px] text-slate-400">Dari galeri perangkat</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Camera permission error */}
        {cameraError && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>{cameraError}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 text-[#D4AF37] hover:underline font-semibold"
              >
                Gunakan Pilih File →
              </button>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {processing && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Memproses foto...
          </div>
        )}

        {/* Photo preview grid */}
        {photos.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                Foto Terpilih
              </span>
              <span className="text-[10px] text-[#D4AF37] font-mono">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-lg overflow-hidden bg-slate-800 group"
                >
                  <img
                    src={photo.preview}
                    alt={photo.fileName}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-all"
                    title="Hapus"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-slate-200 px-1 py-0.5 text-center">
                    {photo.sizeKB} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload button */}
        {photos.length > 0 && (
          <button
            onClick={handleUpload}
            disabled={uploading || processing}
            className="w-full py-3.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-sm tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mengupload...
              </>
            ) : (
              <>
                <CloudUpload className="w-4 h-4" />
                Upload {photos.length} Foto
              </>
            )}
          </button>
        )}

        {/* Error */}
        {error && allowed && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Info */}
        <div className="text-[10px] text-slate-500 space-y-1 pt-2">
          <p>
            Maksimal {MAX_PHOTOS} foto per sesi. Foto dikompres otomatis (maks {MAX_DIMENSION}px, JPEG {JPEG_QUALITY}).
          </p>
          <p>Foto akan ditinjau admin sebelum tampil di galeri.</p>
        </div>
      </div>

      {/* Back link */}
      <div className="text-center pb-4 px-4">
        <button
          onClick={() => {
            stopCamera();
            router.push(`/?gallery=${galleryId}`);
          }}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#D4AF37] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Kembali ke Galeri
        </button>
      </div>
    </div>
  );
}
