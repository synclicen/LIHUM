import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import Header from "./components/Header";
import AdminPanel from "./components/AdminPanel";
import GalleryView from "./components/GalleryView";
import ShareModal from "./components/ShareModal";
import { ProjectSummary } from "./types";
import { initAuth, adminSignInWithGoogle, adminLogout, getAdminAccessToken } from "./firebase";
import { 
  Sparkles, Sliders, Globe, Lock, ArrowRight, ShieldCheck, 
  HelpCircle, Image as ImageIcon, CheckCircle, RefreshCw, Share2 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [role, setRole] = useState<"admin" | "manager" | null>(null);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [shareProject, setShareProject] = useState<ProjectSummary | null>(null);

  // Load projects from the backend
  const loadProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Gagal memuat galeri dari server.");
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error("Gagal mengambil daftar proyek:", err);
    } finally {
      setLoading(false);
    }
  };

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = initAuth(
      async (firebaseUser, token) => {
        setUser(firebaseUser);
        setAccessToken(token);
        
        // Fetch role from server
        try {
          const res = await fetch("/api/accounts/me", {
            headers: { "x-user-email": firebaseUser.email || "" }
          });
          if (res.ok) {
            const data = await res.json();
            setRole(data.role);
            // By default, turn on admin mode once logged in successfully as admin or manager
            setIsAdminMode(!!data.role);
          } else {
            setRole(null);
            setIsAdminMode(false);
          }
        } catch (err) {
          console.error("Gagal mengambil peran akun:", err);
          setRole(null);
          setIsAdminMode(false);
        }
      },
      () => {
        setUser(null);
        setAccessToken("");
        setRole(null);
        setIsAdminMode(false);
      }
    );

    loadProjects();

    // Scan for shared gallery query parameters
    const params = new URLSearchParams(window.location.search);
    const galleryId = params.get("gallery") || params.get("project");
    if (galleryId) {
      setSelectedProjectId(galleryId);
    }

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await adminSignInWithGoogle();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        
        // Fetch role
        const res = await fetch("/api/accounts/me", {
          headers: { "x-user-email": result.user.email || "" }
        });
        if (res.ok) {
          const data = await res.json();
          setRole(data.role);
          if (data.role) {
            setIsAdminMode(true);
          } else {
            setIsAdminMode(false);
            alert("Akses ditolak. Email Anda tidak terdaftar sebagai Admin atau Manajer di sistem LIHUM.");
          }
        }
      }
    } catch (err: any) {
      alert(`Login gagal: ${err.message || err}`);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setUser(null);
    setAccessToken("");
    setRole(null);
    setIsAdminMode(false);
  };

  // Deep select a project to view and synch query state
  const handleSelectProject = (projectId: string, forceAdminView = false) => {
    setSelectedProjectId(projectId);
    if (projectId) {
      const url = new URL(window.location.href);
      url.searchParams.set("gallery", projectId);
      window.history.pushState({}, "", url.toString());
    }
    if (!forceAdminView) {
      // Roll view down to gallery instantly
      window.scrollTo({ top: 300, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0714] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-100">
      
      {/* Top Banner Navigation */}
      <Header
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
        role={role}
      />

      {/* Main Core Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        
        {/* If a specific Gallery is SELECTED by visitor, load the gallery view */}
        {selectedProjectId ? (
          <GalleryView
            projectId={selectedProjectId}
            onBack={() => {
              setSelectedProjectId(null);
              const url = new URL(window.location.href);
              url.searchParams.delete("gallery");
              url.searchParams.delete("project");
              window.history.pushState({}, "", url.toString());
              loadProjects();
            }}
            onShare={(proj) => setShareProject(proj)}
            isAdmin={isAdminMode && !!user}
          />
        ) : (
          /* OTHERWISE: Display Home Lobby view */
          <div className="space-y-12">
            
            {/* Spectacular Hero Banner containing project name */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#4C2A85] via-[#1c0f33] to-[#0C061A] border-2 border-[#D4AF37]/25 p-8 md:p-12 shadow-2xl">
              {/* Backglow glows matching Purple and Gold */}
              <div className="absolute top-0 left-0 w-96 h-96 bg-[#4C2A85]/20 rounded-full filter blur-[100px] pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#D4AF37]/5 rounded-full filter blur-[80px] pointer-events-none" />

              <div className="space-y-4 max-w-3xl relative z-10">
                <span className="inline-flex items-center space-x-2 bg-[#D4AF37]/15 text-[#D4AF37] px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-[#D4AF37]/30">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Gerbang Galeri Publik</span>
                </span>
                <h1 className="text-3xl md:text-5xl font-extrabold font-serif text-white tracking-wide leading-tight">
                  LIHUM<span className="text-[#D4AF37]">: Lihat Galeri Mandiri</span>
                </h1>
                <p className="text-slate-200 text-sm md:text-base leading-relaxed font-light">
                  Media berbagi foto kegiatan, pengunjung bebas memilih dan mengunduh foto langsung di halaman galeri yang dibagikan secara mandiri.
                </p>
              </div>
            </div>

            {/* If logged in but role is null (unregistered) */}
            {user && role === null && (
              <div className="bg-[#1C0F32]/60 border-2 border-red-500/30 rounded-3xl p-8 text-center max-w-2xl mx-auto shadow-2xl space-y-4 backdrop-blur-md">
                <p className="text-red-400 font-bold font-serif text-lg flex items-center justify-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mr-1" />
                  Akses Ditolak &mdash; Akun Belum Terdaftar
                </p>
                <p className="text-slate-200 text-sm leading-relaxed">
                  Email Anda <code className="bg-[#0C061A] border border-[#D4AF37]/20 px-2 py-1 rounded text-[#D4AF37] font-mono text-xs">{user.email}</code> telah masuk dengan aman melalui Google Auth, tetapi belum didaftarkan sebagai **Admin** atau **Manajer** di sistem LIHUM.
                </p>
                <p className="text-xs text-slate-400">
                  Silakan hubungi Admin Utama (synclicen@gmail.com) agar email Anda didaftarkan untuk mendapatkan izin akses mengelola & membagikan galeri kegiatan.
                </p>
                <button
                  onClick={handleLogout}
                  className="mt-2 inline-flex items-center justify-center py-2 px-5 rounded-xl bg-red-650/45 text-red-200 hover:bg-red-900/30 border border-red-900/40 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98]"
                >
                  Keluar Akun
                </button>
              </div>
            )}

            {/* If Admin panel toggled active & User is logged in, show Admin panel */}
            <AnimatePresence mode="wait">
              {isAdminMode && user && role !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="bg-[#120A21]/50 border border-[#D4AF37]/20 p-6 rounded-3xl shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-6 border-b border-[#D4AF37]/10 pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
                      <span className="text-xs uppercase font-mono text-[#D4AF37] tracking-widest font-bold flex items-center space-x-1">
                        <ShieldCheck className="w-4 h-4 text-[#D4AF37] inline" />
                        <span>Panel {role === "admin" ? "Administrator" : "Manajer"} Aktif</span>
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#1F0F3D] border border-[#D4AF37]/25 px-3 py-1 rounded-full text-slate-300 font-mono">
                      User: {user.email} ({role.toUpperCase()})
                    </span>
                  </div>
                  
                  <AdminPanel
                    projects={projects}
                    accessToken={accessToken}
                    onRefresh={loadProjects}
                    onSelectProject={handleSelectProject}
                    onShare={(proj) => setShareProject(proj)}
                    userEmail={user.email || ""}
                    userRole={role}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* PUBLIC VISITOR GALLERIES AREA */}
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/15">
                <div className="space-y-1">
                  <h2 className="text-xl md:text-2xl font-bold font-serif text-[#D4AF37] tracking-wide inline-flex items-center">
                    Pilih Galeri Foto Kegiatan
                  </h2>
                  <p className="text-xs text-slate-350">Silakan pilih destinasi di bawah ini untuk melihat foto-foto yang dibagikan.</p>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
                  <span className="text-xs text-slate-400 font-mono">Memuat galeri kegiatan...</span>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-20 bg-[#120A21] border border-dashed border-[#D4AF37]/30 rounded-2xl">
                  <ImageIcon className="w-12 h-12 text-[#D4AF37]/45 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">Belum ada galeri kegiatan publik yang tersedia saat ini.</p>
                  <p className="text-xs text-slate-500 mt-1">Harap beralih masuk sebagai Admin di menu kanan atas untuk mendaftarkan lokasi baru.</p>
                </div>
              ) : (
                /* Grid of Public galleries formatted nicely in White Asgard with Gold accents */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((project) => {
                    return (
                      <div
                        key={project.id}
                        onClick={() => handleSelectProject(project.id)}
                        className="group relative bg-white text-slate-800 border-2 border-slate-100 hover:border-[#D4AF37] rounded-2xl p-6 cursor-pointer transform hover:translate-y-[-4px] hover:shadow-2xl transition-all duration-300 flex flex-col justify-between"
                      >
                        {/* Hover backglow indicator */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#4C2A85]/5 to-[#D4AF37]/5 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300 pointer-events-none" />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4AF37] font-semibold bg-[#1F0F3D] px-2 py-0.5 rounded">
                              LIHUM: Lihat Galeri Mandiri
                            </span>
                            <span className={`text-[9px] px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1 border font-semibold ${
                              project.displayMode === "all"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-amber-50 text-amber-600 border-amber-100"
                            }`}>
                              {project.displayMode === "all" ? (
                                <>
                                  <Globe className="w-2.5 h-2.5 mr-0.5 text-emerald-500" />
                                  <span>Eksplorasi</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-2.5 h-2.5 mr-0.5 text-amber-500" />
                                  <span>Cari Saja</span>
                                </>
                              )}
                            </span>
                          </div>

                          <h3 className="text-lg font-serif font-bold text-slate-900 group-hover:text-[#4C2A85] transition-colors leading-snug">
                            {project.name}
                          </h3>

                          <p className="text-xs text-slate-550 line-clamp-3 leading-relaxed">
                            {project.description || "Temukan kumpulan keindahan foto kegiatan di sini."}
                          </p>
                        </div>

                        {/* Public Action foot */}
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-550 font-medium">
                          <span className="font-mono bg-[#1F0F3D] text-[#D4AF37] py-1 px-3 rounded-full font-bold">
                            {project.photoCount} Foto
                          </span>
                          
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setShareProject(project)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#4C2A85] hover:bg-slate-100 transition-colors flex items-center"
                              title="Bagikan galeri ini (Tautan & QR Code)"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>

                            <span 
                              onClick={() => handleSelectProject(project.id)}
                              className="inline-flex items-center space-x-1 text-slate-700 font-bold hover:text-[#4C2A85] transition-colors cursor-pointer"
                            >
                              <span>Buka Galeri</span>
                              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Luxury Footer details */}
      <footer className="bg-[#120A21] border-t border-[#D4AF37]/20 py-8 text-center text-xs text-slate-400 font-mono">
        <p>&copy; 2026 LIHUM: Lihat Galeri Mandiri.</p>
        <p className="text-[10px] text-[#D4AF37]/85 mt-1">
          Made by Fajrianor - Pusat Hubungan Masyarakat dan Keterbukaan Informasi 2026.
        </p>
      </footer>

      {/* Share Popup Overlay */}
      <AnimatePresence>
        {shareProject && (
          <ShareModal
            project={shareProject}
            onClose={() => setShareProject(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
