import React, { useState } from "react";
import { ProjectSummary, Project } from "../types";
import { 
  FolderKanban, Plus, Edit2, Trash2, RefreshCw, Sliders, 
  HelpCircle, ExternalLink, Library, CheckCircle, AlertCircle, Info, Lock, Globe, Share2 
} from "lucide-react";

interface AdminPanelProps {
  projects: ProjectSummary[];
  accessToken: string;
  onRefresh: () => void;
  onSelectProject: (id: string, isAdminSelection: boolean) => void;
  onShare?: (proj: ProjectSummary) => void;
}

export default function AdminPanel({
  projects,
  accessToken,
  onRefresh,
  onSelectProject,
  onShare
}: AdminPanelProps) {
  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [displayMode, setDisplayMode] = useState<"all" | "search">("all");

  const [isLoading, setIsLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setDriveFolderUrl("");
    setDisplayMode("all");
    setErrorMsg("");
  };

  const handleEditClick = (project: ProjectSummary) => {
    setIsEditing(true);
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description);
    setDriveFolderUrl(project.driveFolderUrl);
    setDisplayMode(project.displayMode);
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !driveFolderUrl.trim()) {
      setErrorMsg("Nama galeri dan Link Google Drive wajib diisi.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, driveFolderUrl, displayMode })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan galeri.");
      }

      setSuccessMsg(editingId ? "Galeri berhasil diperbarui!" : "Galeri baru sukses dibuat!");
      resetForm();
      onRefresh();

      // Clear success feedback after 3s
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses galeri.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const isConfirmed = window.confirm(`Apakah Anda yakin ingin menghapus galeri "${name}"? Seluruh metadata foto yang tersinkron akan ikut terhapus.`);
    if (!isConfirmed) return;

    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Gagal menghapus galeri.");

      setSuccessMsg("Galeri berhasil dihapus.");
      onRefresh();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncDrive = async (projectId: string) => {
    setSyncingId(projectId);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ditolak dari Google Drive.");
      }

      const data = await res.json();
      setSuccessMsg(`Sinkronisasi sukses! Berhasil memuat ${data.photoCount} foto dari Google Drive.`);
      onRefresh();
      
      // Auto open synced gallery for viewing
      setTimeout(() => {
        setSuccessMsg("");
        onSelectProject(projectId, false);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Gagal terhubung dengan Drive. Pastikan folder tersebut shared \"Anyone with the link can view\" atau login Anda belum kedaluwarsa.");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div id="admin-panel-container" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Form Section */}
      <div className="lg:col-span-1 bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl p-6 shadow-2xl relative backdrop-blur-sm self-start">
        <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-[#D4AF37]/15">
          <FolderKanban className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="text-md font-serif font-bold text-white">
            {editingId ? "Ubah Pengaturan Galeri" : "Buat Galeri Baru"}
          </h2>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/25 text-red-350 rounded-lg text-xs mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start space-x-2 p-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-350 rounded-lg text-xs mb-4">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
              Nama Kegiatan
            </label>
            <input
              type="text"
              placeholder="Contoh: Taman Bunga Indah"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
              Deskripsi Singkat
            </label>
            <textarea
              placeholder="Berikan info tentang lokasi ini untuk pengunjung..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 resize-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5 flex items-center justify-between">
              <span>Link Folder Google Drive</span>
              <span className="group relative cursor-pointer">
                <HelpCircle className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="absolute bottom-full right-0 w-64 bg-slate-950 text-[10px] text-slate-300 p-2.5 rounded-lg border border-[#D4AF37]/20 shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none z-50">
                  Pergi ke Google Drive, klik kanan folder, pilih Bagikan &gt; Siapa saja yang memiliki link dapat melihat. Lalu salin link-nya dan tempel di sini.
                </span>
              </span>
            </label>
            <div className="relative">
              <input
                type="url"
                placeholder="https://drive.google.com/drive/folders/ID_FOLDER..."
                value={driveFolderUrl}
                onChange={(e) => setDriveFolderUrl(e.target.value)}
                className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 transition-all"
                required
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>Cukup salin-tempel tautan folder Drive publik Anda secara langsung.</span>
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
              Bagaimana Foto Ditampilkan ke Umum?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDisplayMode("all")}
                className={`py-2 px-3.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                  displayMode === "all"
                    ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70 shadow-lg shadow-black/20"
                    : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                }`}
              >
                <div className="flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Semua Foto</span>
                </div>
                <span className="text-[9px] text-slate-300 text-center font-normal">Seketika tampil saat diklik</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode("search")}
                className={`py-2 px-3.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                  displayMode === "search"
                    ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70 shadow-lg shadow-black/20"
                    : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                }`}
              >
                <div className="flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hanya Pencarian</span>
                </div>
                <span className="text-[9px] text-slate-300 text-center font-normal">Wajib ketik nama untuk melihat</span>
              </button>
            </div>
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-xs tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
            >
              {isLoading ? "Memproses..." : editingId ? "Terapkan Perubahan" : "Deploy Gallery"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="py-2.5 px-3.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs transition-all"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Grid of Projects */}
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#D4AF37]/15">
          <div className="flex items-center space-x-2.5">
            <Library className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-md font-serif font-bold text-white">Daftar Galeri di Server</h2>
          </div>
          <span className="text-xs bg-[#120A21] text-slate-350 border border-[#D4AF37]/30 py-1 px-3 rounded-full font-mono">
            {projects.length} Total
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37]/30 p-12 text-center bg-[#120A21]/40">
            <FolderKanban className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Belum ada galeri yang terbuat. Buat galeri pertama Anda di panel kiri!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project) => {
              const isSyncing = syncingId === project.id;
              const hasNoPhotos = project.photoCount === 0;

              return (
                <div
                  key={project.id}
                  className="bg-[#120A21] border border-violet-950/80 hover:border-[#D4AF37]/45 rounded-xl p-5 flex flex-col justify-between transition-all group hover:bg-[#1C0F32] shadow-xl"
                >
                  <div>
                    {/* Card Head */}
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-serif text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors">
                        {project.name}
                      </h3>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1 border font-medium ${
                        project.displayMode === "all"
                          ? "bg-emerald-950/45 text-emerald-400 border-emerald-900/50"
                          : "bg-amber-950/40 text-amber-400 border-amber-900/50"
                      }`}>
                        {project.displayMode === "all" ? (
                          <>
                            <Globe className="w-2.5 h-2.5 mr-0.5 text-emerald-400" />
                            <span>Publik</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-2.5 h-2.5 mr-0.5 text-amber-400" />
                            <span>Pencarian</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-xs text-slate-350 line-clamp-2 mb-3 h-8">
                      {project.description || "Tanpa deskripsi."}
                    </p>

                    <div className="space-y-1.5 list-none text-[11px] text-slate-350 border-t border-violet-950/60 py-3 mb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Jumlah Foto:</span>
                        <span className={`font-mono font-bold ${hasNoPhotos ? "text-amber-400" : "text-[#D4AF37]"}`}>
                          {project.photoCount} foto
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Dibuat Pada:</span>
                        <span className="font-mono text-slate-300">{project.createdAt}</span>
                      </div>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-500">Google Drive:</span>
                        <a
                          href={project.driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#D4AF37] hover:underline inline-flex items-center space-x-0.5"
                        >
                          <span className="truncate max-w-[80px]">Buka Link</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Operational Controls */}
                  <div className="flex items-center justify-between border-t border-violet-950/50 pt-3 gap-2">
                    <button
                      onClick={() => handleSyncDrive(project.id)}
                      disabled={isSyncing}
                      className="flex-1 select-none flex items-center justify-center space-x-1 py-1.5 px-3 rounded-lg text-xs bg-[#4C2A85] border border-[#D4AF37]/35 hover:bg-[#5a329d] hover:border-[#D4AF37] text-white disabled:opacity-50 transition-all font-bold scale-[0.98] active:scale-[0.94] shadow-md shadow-black/25"
                      title="Sinkronisasi otomatis dengan Google Drive"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-0.5 ${isSyncing ? "animate-spin text-[#D4AF37]" : ""}`} />
                      <span>{isSyncing ? "Menyinkron..." : "Sinkron Drive"}</span>
                    </button>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onShare) onShare(project);
                        }}
                        disabled={isSyncing}
                        className="p-1.5 rounded-lg border border-violet-950 hover:border-[#D4AF37] text-[#D4AF37] hover:text-white hover:bg-[#4C2A85]/20 transition-all font-semibold cursor-pointer"
                        title="Bagikan galeri (Salin Link & QR Code)"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleEditClick(project);
                        }}
                        disabled={isSyncing}
                        className="p-1.5 rounded-lg border border-violet-950 hover:border-[#D4AF37] text-slate-400 hover:text-white hover:bg-[#4C2A85]/20 transition-all cursor-pointer"
                        title="Ubah galeri"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(project.id, project.name);
                        }}
                        disabled={isSyncing}
                        className="p-1.5 rounded-lg border border-violet-950 hover:border-red-600/50 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all cursor-pointer"
                        title="Hapus galeri"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Warning if no photos synced */}
                  {hasNoPhotos && !isSyncing && (
                    <div className="mt-2 text-[10px] bg-amber-500/5 border border-amber-500/10 text-amber-400/80 p-1.5 rounded text-center font-semibold">
                      ⚠ Belum disinkron. Klik &quot;Sinkron Drive&quot; agar foto tampil!
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
