import React, { useState, useEffect } from "react";
import { Project, Photo } from "../types";
import { 
  ArrowLeft, Search, Download, Eye, Calendar, HardDrive, 
  ChevronRight, Sparkles, X, ChevronLeft, Image as ImageIcon, Loader2, Lock, HelpCircle, Share2 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GalleryViewProps {
  projectId: string;
  onBack: () => void;
  onShare?: (project: any) => void;
  isAdmin?: boolean;
}

export default function GalleryView({ projectId, onBack, onShare, isAdmin }: GalleryViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);

  // Debounce search query to prevent excessive backend fetching
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 450);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Fetch project details (with photos list)
  useEffect(() => {
    const fetchProjectDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}?search=${encodeURIComponent(debouncedQuery)}`);
        if (!res.ok) throw new Error("Gagal mengambil data galeri.");
        const data = await res.json();
        setProject(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectDetails();
  }, [projectId, debouncedQuery]);

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
  };

  // Helper to strip extension from names for a neat human-readable look
  const formatPhotoName = (fileName: string) => {
    return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
  };

  const handleDownload = (photo: Photo) => {
    // Direct link to the backend download route
    const downloadUrl = `/api/photo-proxy/download?id=${photo.id}&name=${encodeURIComponent(photo.name)}`;
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
    <div id="gallery-view-container" className="space-y-8 animate-fadeIn">
      {/* Gallery Header navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-violet-900/30">
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

        {project && (
          <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-mono">
            <span>Server /</span>
            <span className="text-slate-400 capitalize">{project.displayMode} Mode</span>
            <span>/</span>
            <span className="text-[#D4AF37] font-bold">{project.photoCount} Total Foto</span>
          </div>
        )}
      </div>

      {loading && !project ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
          <p className="text-sm text-slate-400">Menghubungkan ke pangkalan foto LIHUM...</p>
        </div>
      ) : !project ? (
        <div className="text-center py-16 bg-slate-900/10 rounded-2xl border border-violet-950">
          <p className="text-red-400 text-sm">Gagal memuat galeri. Kemungkinan galeri telah dihapus.</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-violet-950 text-white text-xs rounded-xl hover:bg-violet-900"
          >
            Kembali
          </button>
        </div>
      ) : (
        <>
          {/* Gallery Title & Description Hero cards */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900/90 border border-violet-950 p-6 md:p-8 flex flex-col justify-end space-y-3 shadow-2xl">
            {/* Background lights decoration */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-violet-900/10 rounded-full filter blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-amber-600/5 rounded-full filter blur-[60px] pointer-events-none" />

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-widest text-amber-400 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                <span>Eksplorasi Kegiatan</span>
              </span>
              <h2 className="text-2xl md:text-3xl font-bold font-serif text-white tracking-wide leading-tight">
                {project.name}
              </h2>
              <p className="text-slate-300 max-w-3xl text-sm leading-relaxed font-light">
                {project.description || "Temukan foto-foto kegiatan yang berkesan di galeri ini."}
              </p>
            </div>
          </div>

          {/* Majestic Search Panel with Sleek Interface Theme */}
          <div className="w-full max-w-3xl mx-auto mb-6">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isSearchMode
                    ? "Ketik nama foto atau NIM spesifik untuk mengungkap (Wajib)..."
                    : "Cari foto berdasarkan nama atau NIM..."
                }
                className="w-full h-14 pl-12 pr-12 rounded-2xl bg-white border-none shadow-xl text-slate-800 text-md focus:outline-none focus:ring-2 focus:ring-[#D4AF37] placeholder-slate-400 transition-all font-sans"
              />
              <Search className="w-6 h-6 text-slate-450 absolute left-4 top-4" />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-4 top-4 text-slate-450 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isSearchMode && (
              <div className="mt-4 flex items-center justify-center space-x-1.5 text-[11px] text-[#D4AF37]/90 font-mono">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Mode Cari Saja Aktif: Galeri aman terpilih. Hubungi Admin atau gunakan kata kunci untuk melihat.</span>
              </div>
            )}
          </div>

          {/* Results Display */}
          <div className="pt-2">
            {loading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="w-7 h-7 text-amber-500 animate-spin mr-2" />
                <span className="text-xs text-slate-400 font-mono">Memperbarui hasil...</span>
              </div>
            ) : showInitialMessage ? (
              /* Search-only initial welcome */
              <div className="text-center py-20 px-8 rounded-2xl bg-slate-900/20 border border-violet-950/40 max-w-xl mx-auto space-y-4">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <Lock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-serif text-md font-semibold text-slate-200">Keamanan Galeri Aktif</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Atas permintaan Admin, seluruh foto dalam galeri ini disembunyikan secara default. Pengunjung umum dapat menemukannya dengan mengetik kata kunci pada kotak pencarian di atas.
                  </p>
                  <p className="text-[10px] text-amber-500/70 font-mono mt-3">
                    Contoh pencarian pada demo: Hubungi &quot;Palace&quot;, &quot;Aurora&quot;, atau &quot;Ocean&quot;.
                  </p>
                </div>
              </div>
            ) : project.photos.length === 0 ? (
              /* No files found */
              <div className="text-center py-16 rounded-2xl border border-dashed border-violet-950 bg-slate-950/50">
                <ImageIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Tidak ada foto kegiatan yang cocok dengan pencarian Anda.</p>
                {debouncedQuery && (
                  <p className="text-xs text-slate-500 mt-1">Coba gunakan kata kunci nama atau NIM lain.</p>
                )}
              </div>
            ) : (
              /* Main Beautiful Grid */
              <motion.div 
                layout
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
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
                        transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
                        className="group flex flex-col h-full bg-white text-slate-800 border-2 border-slate-100 hover:border-[#D4AF37] rounded-xl shadow-md overflow-hidden justify-between transition-all duration-300 hover:translate-y-[-4px]"
                      >
                        {/* Photo Box */}
                        <div 
                          className="relative aspect-3/2 bg-slate-100 overflow-hidden cursor-pointer"
                          onClick={() => setActivePhoto(photo)}
                        >
                          {/* Image display */}
                          <img
                            src={imageProxySrc}
                            alt={photo.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                            loading="lazy"
                          />
                          
                          {/* Sleek Gradient Overlay with instant download buttons */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(photo);
                              }}
                              className="bg-[#D4AF37] text-[#4C2A85] w-full py-2 rounded-lg text-xs font-extrabold uppercase hover:bg-white tracking-wider transition-colors shadow-2xl"
                            >
                              Download HD
                            </button>
                          </div>

                          {/* Quick size Tag in Sleek monospace */}
                          {photo.size && (
                            <span className="absolute top-2.5 right-2.5 text-[9px] font-mono tracking-wide bg-slate-900/80 text-white py-0.5 px-2 rounded font-medium border border-white/10 backdrop-blur-sm">
                              {photo.size}
                            </span>
                          )}
                        </div>

                        {/* Detail text - White Asgard Marble clean UI */}
                        <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                          <div className="space-y-1">
                            {/* Photo Title */}
                            <h3 
                              onClick={() => setActivePhoto(photo)}
                              className="font-serif text-sm font-bold text-slate-900 line-clamp-1 hover:text-[#4C2A85] cursor-pointer transition-colors"
                              title={photo.name}
                            >
                              {cleanName}
                            </h3>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-slate-500 truncate text-[11px] leading-tight max-w-[150px]">
                                {photo.name}
                              </span>
                              <span className="text-[9px] font-mono uppercase tracking-widest text-[#D4AF37] font-extrabold bg-[#1F0F3D] px-1.5 py-0.5 rounded">
                                {photo.mimeType.split("/")[1] || "JPEG"}
                              </span>
                            </div>
                          </div>

                          {/* Action Foot in sleek white structure */}
                          <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3 text-[11px] text-slate-400">
                            <span className="font-mono text-[10px]">{photo.createdTime || "Baru"}</span>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(photo);
                              }}
                              className="text-slate-550 hover:text-[#4C2A85] p-1 rounded-full hover:bg-slate-50 transition-colors"
                              title="Download Instantly"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </>
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
              className="relative w-full max-w-5xl bg-white text-slate-850 rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
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
                <div className="lg:col-span-8 bg-slate-950 aspect-3/2 flex items-center justify-center relative group">
                  <img
                    src={`/api/photo-proxy?id=${activePhoto.id}&size=full`}
                    alt={activePhoto.name}
                    className="max-h-[70vh] object-contain max-w-full"
                  />
                </div>

                {/* Info dashboard - right (Pearl and gold styling) */}
                <div className="lg:col-span-4 p-6 md:p-8 flex flex-col justify-between bg-[#F8F9FA] border-t lg:border-t-0 lg:border-l border-slate-200">
                  <div className="space-y-5">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-[#D4AF37] font-extrabold bg-[#1F0F3D] px-2 py-0.5 rounded">
                        Pustaka Foto LIHUM
                      </span>
                      <h3 className="font-serif text-lg md:text-xl font-bold text-slate-900 mt-2 tracking-wide leading-snug">
                        {formatPhotoName(activePhoto.name)}
                      </h3>
                      <p className="text-xs text-slate-450 font-mono mt-1 select-all break-all overflow-hidden text-ellipsis">
                        ID: {activePhoto.id}
                      </p>
                    </div>

                    <div className="space-y-3 list-none text-xs border-y border-slate-205 py-5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <HardDrive className="w-4 h-4 text-slate-400" />
                          <span>Ukuran File:</span>
                        </span>
                        <span className="font-mono font-bold text-slate-900">{activePhoto.size || "Unknown"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <Download className="w-4 h-4 text-slate-400" />
                          <span>Format Mime:</span>
                        </span>
                        <span className="font-mono text-slate-900">{activePhoto.mimeType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center space-x-1.5 text-slate-500">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>Ditambahkan:</span>
                        </span>
                        <span className="font-mono text-slate-900">{activePhoto.createdTime || "Baru"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6">
                    {/* Big Download Button matching Sleek Interface Gold/Purple */}
                    <button
                      onClick={() => handleDownload(activePhoto)}
                      className="w-full select-none flex items-center justify-center space-x-2 py-3.5 px-6 bg-[#D4AF37] text-[#4C2A85] hover:bg-[#dfbb66] hover:scale-[1.01] font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-lg active:scale-98"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Gambar High-Res</span>
                    </button>
                    <p className="text-[10px] text-center text-slate-450">
                      Foto diunduh secara penuh dan langsung disimpan ke perangkat Anda.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
