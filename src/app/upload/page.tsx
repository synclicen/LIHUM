"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Upload, X, CheckCircle, AlertCircle, Loader2, LogIn, ImageIcon } from "lucide-react";

interface UploadPhoto {
  base64Data: string;
  mimeType: string;
  fileName: string;
  preview: string;
}

export default function UploadPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0C061A] flex items-center justify-center"><Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" /></div>}>
      <UploadPage />
    </Suspense>
  );
}

function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const galleryId = searchParams.get("gallery") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");

  // Google OAuth state
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string } | null>(null);

  // Upload state
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  const MAX_PHOTOS = 5;

  useEffect(() => {
    if (!galleryId) {
      setError("Gallery ID tidak ditemukan.");
      setLoading(false);
      return;
    }

    // Check if gallery allows visitor upload
    fetch(`/api/projects/${galleryId}`)
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

  // Google Sign-In handler
  const handleGoogleLogin = () => {
    const clientId = "375227071350-ef30fe113a04c90acb1857.apps.googleusercontent.com";
    const redirectUri = `${window.location.origin}/upload`;
    const scope = "https://www.googleapis.com/auth/drive.file";
    const state = `gallery=${galleryId}`;

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;

    window.location.href = authUrl;
  };

  // Check for OAuth token in URL hash (after Google redirect)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const token = params.get("access_token");
      const state = params.get("state") || "";

      if (token) {
        // Clean URL
        window.history.replaceState({}, "", `/upload?gallery=${galleryId}`);

        // Get user info
        fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((user) => {
            setGoogleToken(token);
            setGoogleUser({ name: user.name || user.email, email: user.email });
          })
          .catch(() => {
            setGoogleToken(token);
          });
      }
    }
  }, [galleryId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);

    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" terlalu besar (maks 10MB).`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(",")[1] || "";
        setPhotos((prev) => [
          ...prev,
          {
            base64Data,
            mimeType: file.type,
            fileName: file.name,
            preview: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!googleToken || photos.length === 0) return;
    setUploading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${galleryId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos: photos.map((p) => ({
            base64Data: p.base64Data,
            mimeType: p.mimeType,
            fileName: p.fileName,
          })),
          accessToken: googleToken,
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
        setUploadResult({
          success: false,
          message: data.error || "Gagal upload foto.",
        });
      }
    } catch (err: any) {
      setUploadResult({
        success: false,
        message: err.message || "Gagal terhubung ke server.",
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C061A] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  if (error || !allowed) {
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

  if (uploadResult?.success) {
    return (
      <div className="min-h-screen bg-[#0C061A] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-serif font-bold text-white">Upload Berhasil!</h2>
          <p className="text-sm text-slate-400">{uploadResult.message}</p>
          <p className="text-xs text-slate-500">Foto akan muncul di galeri setelah admin melakukan sinkronisasi.</p>
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

  return (
    <div className="min-h-screen bg-[#0C061A] text-slate-100 flex flex-col items-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Header */}
        <div className="text-center space-y-2 pt-4">
          <div className="w-12 h-12 bg-[#D4AF37] rounded-xl flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6 text-[#4C2A85]" />
          </div>
          <h1 className="text-xl font-serif font-bold text-white">Upload Foto</h1>
          <p className="text-xs text-slate-400">
            Galeri: <strong className="text-[#D4AF37]">{projectName}</strong>
          </p>
        </div>

        {/* Google Login (if not logged in) */}
        {!googleToken && (
          <div className="bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl p-6 text-center space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              Untuk mengupload foto, silakan login dengan Google Anda.
              Foto akan diupload ke folder galeri ini.
            </p>
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all mx-auto"
            >
              <LogIn className="w-4 h-4" />
              Login dengan Google
            </button>
          </div>
        )}

        {/* Upload form (if logged in) */}
        {googleToken && (
          <>
            {/* User info */}
            <div className="flex items-center justify-between bg-[#120A21] border border-[#D4AF37]/15 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-300">
                {googleUser?.email || "Google user"}
              </span>
              <span className="text-[10px] text-[#D4AF37] font-mono">
                {photos.length}/{MAX_PHOTOS} foto
              </span>
            </div>

            {/* Photo preview grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-slate-800 group">
                    <img src={photo.preview} alt={photo.fileName} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload buttons */}
            {photos.length < MAX_PHOTOS && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-4 bg-[#4C2A85] border border-[#D4AF37]/30 rounded-xl hover:bg-[#5a329d] transition-all"
                >
                  <Camera className="w-6 h-6 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-white">Ambil Foto</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-4 bg-[#120A21] border border-[#D4AF37]/30 rounded-xl hover:bg-[#1C0F32] transition-all"
                >
                  <ImageIcon className="w-6 h-6 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-white">Pilih File</span>
                </button>
              </div>
            )}

            {/* Hidden inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Upload button */}
            {photos.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-sm tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengupload...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload {photos.length} Foto
                  </>
                )}
              </button>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Info */}
            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              Maksimal {MAX_PHOTOS} foto per sesi, ukuran maks 10MB per foto.
              Format: JPG, PNG, HEIC.
            </p>
          </>
        )}

        {/* Back link */}
        <div className="text-center pt-2">
          <button
            onClick={() => router.push(`/?gallery=${galleryId}`)}
            className="text-xs text-slate-400 hover:text-[#D4AF37] transition-colors"
          >
            ← Kembali ke Galeri
          </button>
        </div>
      </div>
    </div>
  );
}
