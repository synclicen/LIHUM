"use client";

import React, { useState, useEffect } from "react";
import type { Project, Photo } from "@/types";
import {
  ArrowLeft,
  Search,
  Download,
  Calendar,
  HardDrive,
  Sparkles,
  X,
  Image as ImageIcon,
  Loader2,
  Lock,
  Share2,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GalleryViewProps {
  projectId: string;
  onBack: () => void;
  onShare?: (project: any) => void;
  isAdmin?: boolean;
  userEmail?: string;
}

export default function GalleryView({
  projectId,
  onBack,
  onShare,
  isAdmin,
  userEmail,
}: GalleryViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Password state for private galleries
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordVerifying, setPasswordVerifying] = useState(false);
  // unlockedPassword is stored in sessionStorage so the user doesn't re-enter on every search
  const [unlockedPassword, setUnlockedPassword] = useState<string>("");

  // Sort state — cached per gallery in sessionStorage
  type SortKey = "default" | "name-asc" | "name-desc" | "modified-desc" | "modified-asc";
  const [sortBy, setSortBy] = useState<SortKey>("default");
  useEffect(() => {
    const cached = sessionStorage.getItem(`lihum:gallery-sort:${projectId}`);
    const valid: SortKey[] = ["default", "name-asc", "name-desc", "modified-desc", "modified-asc"];
    if (cached && (valid as string[]).includes(cached)) setSortBy(cached as SortKey);
    else setSortBy("default");
  }, [projectId]);
  const handleSortChange = (val: SortKey) => {
    setSortBy(val);
    sessionStorage.setItem(`lihum:gallery-sort:${projectId}`, val);
  };

  // Load cached password from sessionStorage on mount / project change
  useEffect(() => {
    const cached = sessionStorage.getItem(`lihum:gallery-password:${projectId}`);
    if (cached) setUnlockedPassword(cached);
    else setUnlockedPassword("");
    setPasswordInput("");
  }, [projectId]);

  // Debounce search query to prevent excessive backend fetching
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 450);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Build the fetch URL with optional password + search query + sort
  const buildFetchUrl = (search: string) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (unlockedPassword) params.set("password", unlockedPassword);
    if (sortBy && sortBy !== "default") params.set("sort", sortBy);
    const qs = params.toString();
    return `/api/projects/${projectId}${qs ? `?${qs}` : ""}`;
  };

  // Request headers — include admin email so private galleries are unlocked for admins
  const fetchHeaders: HeadersInit = userEmail
    ? { "x-user-email": userEmail }
    : {};

  // Fetch project details (with photos list)
  useEffect(() => {
    const fetchProjectDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(buildFetchUrl(debouncedQuery), {
          headers: fetchHeaders,
        });
        if (!res.ok) throw new Error("Gagal mengambil data galeri.");
        const data = await res.json();
        setProject(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setPasswordVerifying(false);
      }
    };

    fetchProjectDetails();
  }, [projectId, debouncedQuery, unlockedPassword, userEmail, sortBy]);

  // Dynamic automatic polling to detect additions, deletions, or changes instantly
  useEffect(() => {
    // Don't poll if the gallery is locked (waiting for password)
    if (project?.requiresPassword) return;

    const fetchUpdates = async () => {
      try {
        const res = await fetch(buildFetchUrl(debouncedQuery), {
          headers: fetchHeaders,
        });
        if (res.ok) {
          const data = await res.json();
          setProject((prev) => {
            if (!prev) return data;
            // Don't overwrite with a locked state if we're already unlocked
            if (data.requiresPassword && !prev.requiresPassword) return prev;
            const sizeOrCountChanged =
              prev.photoCount !== data.photoCount ||
              prev.photos?.length !== data.photos?.length;
            if (sizeOrCountChanged) {
              return data;
            }
            const prevIds = (prev.photos || [])
              .map((p) => p.id + p.name)
              .join(",");
            const currIds = (data.photos || [])
              .map((p) => p.id + p.name)
              .join(",");
            if (prevIds !== currIds) {
              return data;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("Latar belakang gagal memuat update:", err);
      }
    };

    const intervalId = setInterval(fetchUpdates, 10000);
    return () => clearInterval(intervalId);
  }, [projectId, debouncedQuery, unlockedPassword, userEmail, project?.requiresPassword, sortBy]);

  // Handle password submission for private galleries
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    // Keep passwordVerifying=true until the fetch effect completes
    // (it sets passwordVerifying=false in its finally block).
    // Also set loading=true so the UI shows a spinner immediately.
    setPasswordVerifying(true);
    setLoading(true);
    sessionStorage.setItem(
      `lihum:gallery-password:${projectId}`,
      passwordInput.trim()
    );
    setUnlockedPassword(passwordInput.trim());
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  const formatPhotoName = (fileName: string) => {
    return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  };

  const handleDownload = (photo: Photo) => {
    const downloadUrl = `/api/photo-proxy/download?id=${photo.id}&name=${encodeURIComponent(
      photo.name
    )}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", photo.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSearchMode = project?.displayMode === "search";
  const showInitialMessage = isSearchMode && debouncedQuery.trim() === "";

  return (
    <div
      id="gallery-view-container"
      className="flex-1 flex flex-col h-full overflow-hidden space-y-4 animate-fadeIn"
    >
      {/* Gallery Header navigation */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-violet-900/30">
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <button
              onClick={onBack}
              className="group flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-[#D4AF37] max-w-max transition-all cursor-pointer mr-2"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              <span>Kembali ke Galeri Utama</span>
            </button>
          )}
          {project && onShare && (
            <button
              onClick={() => onShare(project)}
              className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-[#D4AF37] hover:text-white bg-[#4C2A85]/30 hover:bg-[#4C2A85] border border-[#D4AF37]/20 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-md"
              title="Bagikan Tautan & QR Code Galeri Ini"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Bagikan Galeri</span>
            </button>
          )}
        </div>

      </div>

      {loading && !project ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
          <p className="text-sm text-slate-400">
            Menghubungkan ke pangkalan foto LIHUM...
          </p>
        </div>
      ) : !project ? (
        <div className="flex-grow flex flex-col justify-center items-center py-16 bg-slate-900/10 rounded-2xl border border-violet-950">
          <p className="text-red-400 text-sm">
            Gagal memuat galeri. Kemungkinan galeri telah dihapus.
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-violet-950 text-white text-xs rounded-xl hover:bg-violet-900"
          >
            Kembali
          </button>
        </div>
      ) : project.requiresPassword ? (
        /* ── Private gallery: password prompt ── */
        <div className="flex-grow flex flex-col items-center justify-center py-8">
          <div className="w-full max-w-sm bg-[#120A21]/60 border border-[#D4AF37]/25 rounded-3xl p-8 shadow-2xl space-y-5 backdrop-blur-md text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-md">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-serif text-lg font-bold text-white">
                Galeri Privat
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Galeri <strong className="text-slate-200">{project.name}</strong>{" "}
                bersifat privat. Masukkan password untuk melihat foto di dalamnya.
              </p>
            </div>

            {project.passwordError && (
              <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{project.passwordError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <input
                type="password"
                autoFocus
                placeholder="Masukkan password galeri..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={passwordVerifying}
                className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 transition-all text-center font-mono disabled:opacity-50"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={passwordVerifying || !passwordInput.trim()}
                className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-xs tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-70 shadow-md flex items-center justify-center gap-2"
              >
                {passwordVerifying && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {passwordVerifying ? "Memverifikasi..." : "Buka Galeri"}
              </button>
            </form>

            <div className="pt-3 border-t border-[#D4AF37]/10 space-y-1">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Tidak punya password?
              </p>
              <p className="text-[10px] text-[#D4AF37]/80 font-mono">
                Hubungi Admin: synclicen@gmail.com
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0 space-y-4">
          {/* Top Bar with Left Title & Right Search Input */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 w-full bg-[#120A21]/40 border border-violet-900/20 p-2.5 rounded-2xl">
            <div className="relative overflow-hidden rounded-xl bg-violet-950/10 border border-[#D4AF37]/10 p-3 flex-grow md:max-w-xl md:w-auto shadow-md text-left">
              <div className="absolute inset-0 bg-violet-950/5 backdrop-blur-[1px] pointer-events-none" />

              <div className="relative z-10 flex flex-col space-y-0.5">
                <div className="flex items-center space-x-1.5 text-[8px] uppercase font-mono tracking-widest text-amber-400">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>Dokumentasi Kegiatan</span>
                </div>
                <h2 className="text-sm md:text-base font-bold font-serif text-white tracking-wide leading-snug">
                  {project.name}
                </h2>
                {project.description && (
                  <p className="text-slate-400 text-[10px] leading-relaxed font-light line-clamp-1">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full md:max-w-xs flex-shrink-0 flex flex-col justify-center gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isSearchMode
                      ? "Ketik Nama atau ID (Wajib)..."
                      : "Ketik Nama atau ID..."
                  }
                  className="w-full h-10 pl-9 pr-9 rounded-lg bg-white border-none shadow-md text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37] placeholder-slate-400 transition-all font-sans"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-800 p-0.5 rounded-full hover:bg-slate-100 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="relative">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value as any)}
                  className="w-full h-8 pl-8 pr-7 rounded-lg bg-white border-none shadow-md text-slate-700 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] transition-all font-sans appearance-none cursor-pointer"
                  title="Urutkan foto"
                >
                  <option value="default">Urutan Default</option>
                  <option value="name-asc">Nama (A → Z)</option>
                  <option value="name-desc">Nama (Z → A)</option>
                  <option value="modified-desc">Terbaru Diubah</option>
                  <option value="modified-asc">Terlama Diubah</option>
                </select>
                <svg
                  className="w-3 h-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isSearchMode && (
                <div className="flex items-center justify-start space-x-1 text-[8px] text-[#D4AF37]/90 font-mono">
                  <Lock className="w-2.5 h-2.5 text-[#D4AF37] shrink-0" />
                  <span>Mode Cari Aktif</span>
                </div>
              )}
            </div>
          </div>

          {/* Results Display */}
          <div
            ref={scrollContainerRef}
            className="flex-grow min-h-0 overflow-y-auto pr-1 select-none custom-scrollbar pb-6 pt-1"
          >
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-7 h-7 text-amber-500 animate-spin mr-2" />
                <span className="text-xs text-slate-400 font-mono">
                  Memperbarui hasil...
                </span>
              </div>
            ) : showInitialMessage ? (
              <div className="text-center py-12 px-6 rounded-2xl bg-slate-900/20 border border-violet-950/40 max-w-md mx-auto space-y-4">
                <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-serif text-sm font-semibold text-slate-200">
                    Keamanan Galeri Aktif
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Atas permintaan Admin, seluruh foto dalam galeri ini
                    disembunyikan secara default. Pengunjung umum dapat
                    menemukannya dengan mengetik kata kunci pada kotak pencarian
                    di atas.
                  </p>
                  <p className="text-[9px] text-amber-500/70 font-mono mt-2">
                    Contoh pencarian pada demo: Hubungi &quot;Palace&quot;,
                    &quot;Aurora&quot;, atau &quot;Ocean&quot;.
                  </p>
                </div>
              </div>
            ) : project.photos.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-violet-950 bg-slate-950/50">
                <ImageIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-xs text-slate-400">
                  Tidak ada foto kegiatan yang cocok dengan pencarian Anda.
                </p>
                {debouncedQuery && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Coba gunakan kata kunci Nama atau ID lain.
                  </p>
                )}
              </div>
            ) : (
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {project.photos.map((photo, index) => {
                    const cleanName = formatPhotoName(photo.name);
                    const imageProxySrc = `/api/photo-proxy?id=${photo.id}`;

                    return (
                      <motion.div
                        key={photo.id}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{
                          duration: 0.3,
                          delay: Math.min(index * 0.04, 0.4),
                        }}
                        className="group flex flex-col h-full bg-white text-slate-800 border-2 border-slate-100 hover:border-[#D4AF37] rounded-xl shadow-md overflow-hidden justify-between transition-all duration-300 hover:translate-y-[-4px]"
                      >
                        {/* Photo Box */}
                        <div
                          className="relative bg-slate-100 overflow-hidden cursor-pointer select-none"
                          style={{ aspectRatio: "3 / 2" }}
                          onClick={() => setActivePhoto(photo)}
                        >
                          {/* Image display */}
                          <img
                            src={imageProxySrc}
                            alt={photo.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                            loading="lazy"
                          />

                          {/* Quick size Tag in Sleek monospace */}
                          {photo.size && (
                            <span className="absolute top-2.5 right-2.5 text-[9px] font-mono tracking-wide bg-slate-900/80 text-white py-0.5 px-2 rounded font-medium border border-white/10 backdrop-blur-sm pointer-events-none">
                              {photo.size}
                            </span>
                          )}

                          {/* Quick download button directly on the image */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(photo);
                            }}
                            className="absolute bottom-2.5 right-2.5 z-10 bg-[#D4AF37] hover:bg-[#dfbb66] active:scale-90 text-[#4C2A85] p-2 rounded-lg shadow-md transition-all cursor-pointer"
                            title="Unduh Langsung"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2.5"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                          </button>
                        </div>

                        {/* Detail text */}
                        <div className="p-3 bg-white">
                          <div className="space-y-0.5">
                            <h3
                              onClick={() => setActivePhoto(photo)}
                              className="font-serif text-xs font-bold text-slate-900 line-clamp-1 hover:text-[#4C2A85] cursor-pointer transition-colors"
                              title={photo.name}
                            >
                              {cleanName}
                            </h3>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono text-slate-400 truncate leading-tight max-w-full">
                                {photo.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Photobox Fullscreen Modal Lightbox */}
      <AnimatePresence>
        {activePhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
            onClick={() => setActivePhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 180 }}
              className="relative w-full max-w-5xl bg-white text-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button top-right */}
              <button
                onClick={() => setActivePhoto(null)}
                className="absolute top-4 right-4 z-10 p-2.5 text-white hover:text-red-500 bg-slate-950/70 hover:bg-white rounded-full transition-all border border-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Photo canvas - left */}
                <div
                  className="lg:col-span-8 bg-slate-950 flex items-center justify-center relative group"
                  style={{ aspectRatio: "3 / 2" }}
                >
                  <img
                    src={`/api/photo-proxy?id=${activePhoto.id}&size=full`}
                    alt={activePhoto.name}
                    className="max-h-[70vh] object-contain max-w-full"
                  />
                </div>

                {/* Info dashboard - right */}
                <div className="lg:col-span-4 p-6 md:p-8 flex flex-col justify-start bg-[#F8F9FA] border-t lg:border-t-0 lg:border-l border-slate-200 space-y-6">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] uppercase font-mono tracking-widest text-[#D4AF37] font-extrabold bg-[#1F0F3D] px-2 py-0.5 rounded">
                        LIHUM: Lihat, Unduh Mandiri
                      </span>

                      <button
                        onClick={() => handleDownload(activePhoto)}
                        className="flex items-center space-x-1.5 py-1.5 px-3.5 bg-[#D4AF37] text-[#4C2A85] hover:bg-[#dfbb66] active:scale-95 font-extrabold rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer select-none"
                        title="Download Gambar"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh</span>
                      </button>
                    </div>

                    <h3 className="font-serif text-lg md:text-xl font-bold text-slate-900 mt-4 tracking-wide leading-snug">
                      {formatPhotoName(activePhoto.name)}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 select-all break-all overflow-hidden text-ellipsis">
                      ID: {activePhoto.id}
                    </p>
                  </div>

                  <div className="space-y-3 list-none text-xs border-t border-slate-200 pt-5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1.5 text-slate-500">
                        <HardDrive className="w-4 h-4 text-slate-400" />
                        <span>Ukuran File:</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {activePhoto.size || "Unknown"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1.5 text-slate-500">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>Ditambahkan:</span>
                      </span>
                      <span className="font-mono text-slate-900">
                        {activePhoto.createdTime || "Baru"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed pt-2">
                    Foto diunduh secara penuh dan langsung disimpan ke perangkat
                    Anda.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
