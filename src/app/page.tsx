"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import Header from "@/components/lihum/Header";
import AdminPanel from "@/components/lihum/AdminPanel";
import GalleryView from "@/components/lihum/GalleryView";
import ShareModal from "@/components/lihum/ShareModal";
import type { ProjectSummary } from "@/types";
import {
  initAuth,
  adminSignInWithGoogle,
  adminLogout,
} from "@/lib/firebase";
import {
  Sparkles,
  Globe,
  Lock,
  ArrowRight,
  ShieldCheck,
  Image as ImageIcon,
  RefreshCw,
  Share2,
  Download,
  QrCode,
  Camera,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [role, setRole] = useState<"admin" | "manager" | null>(null);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [shareProject, setShareProject] = useState<ProjectSummary | null>(null);

  // Ref that always holds the latest admin email, so loadProjects (which is
  // captured once by the polling interval) always reads the current value
  // instead of a stale closure.
  const userEmailRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    userEmailRef.current = user?.email || undefined;
  }, [user]);

  // Load projects from the backend.
  // When an admin/manager is logged in, we send their email so the API
  // returns ALL galleries (including hidden ones). The public grid below
  // filters hidden galleries client-side so visitors don't see them,
  // while the AdminPanel receives the full list for management.
  const loadProjects = async () => {
    try {
      const headers: HeadersInit = {};
      if (userEmailRef.current) {
        headers["x-user-email"] = userEmailRef.current;
      }
      const res = await fetch("/api/projects", { headers });
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
        // Update the ref immediately so loadProjects (called below) picks
        // up the admin email and fetches ALL galleries including hidden ones.
        userEmailRef.current = firebaseUser.email || undefined;

        try {
          const res = await fetch("/api/accounts/me", {
            headers: { "x-user-email": firebaseUser.email || "" },
          });
          if (res.ok) {
            const data = await res.json();
            setRole(data.role);
            setIsAdminMode(!!data.role);
            // Re-fetch projects now that we have an admin email — this
            // populates the AdminPanel with hidden galleries too.
            loadProjects();
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
        userEmailRef.current = undefined;
        loadProjects();
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

        const res = await fetch("/api/accounts/me", {
          headers: { "x-user-email": result.user.email || "" },
        });
        if (res.ok) {
          const data = await res.json();
          setRole(data.role);
          if (data.role) {
            setIsAdminMode(true);
          } else {
            setIsAdminMode(false);
            alert(
              "Akses ditolak. Email Anda tidak terdaftar sebagai Admin atau Manajer di sistem LIHUM."
            );
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

  // Deep select a project to view and sync query state
  const handleSelectProject = (
    projectId: string,
    forceAdminView = false
  ) => {
    setSelectedProjectId(projectId);
    if (projectId) {
      const url = new URL(window.location.href);
      url.searchParams.set("gallery", projectId);
      window.history.pushState({}, "", url.toString());
    }
    if (!forceAdminView) {
      window.scrollTo({ top: 300, behavior: "smooth" });
    }
  };

  // Click logo → go back to home (clear gallery selection + URL params)
  const handleLogoClick = () => {
    setSelectedProjectId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("gallery");
    url.searchParams.delete("project");
    window.history.pushState({}, "", url.toString());
    loadProjects();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Polling for latest metadata so that public visitors automatically get synced updates
  useEffect(() => {
    const fetchMetadataInterval = setInterval(() => {
      loadProjects();
    }, 15000);

    return () => clearInterval(fetchMetadataInterval);
  }, []);

  // Automated background sync scheduler for projects with autoSyncEnabled = true.
  // Uses a ref for projects so the interval callback always reads the latest
  // project list WITHOUT causing the effect to re-run and reset the interval.
  // Otherwise, loadProjects() (called every 15s) would change `projects`,
  // re-run this effect, clear the interval, and never let the first sync fire.
  const projectsRef = useRef<ProjectSummary[]>([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!accessToken || !user) return;

    // Compute a stable signature of which projects need auto-sync.
    // Only re-create intervals when the set of synced projects or their
    // intervals actually change (not when photoCount/lastSyncedAt update).
    const syncedProjects = projectsRef.current.filter((p) => p.autoSyncEnabled);
    if (syncedProjects.length === 0) return;

    const intervals: ReturnType<typeof setInterval>[] = [];

    syncedProjects.forEach((proj) => {
      let ms = 180000;
      switch (proj.autoSyncInterval) {
        case "30s":
          ms = 30000;
          break;
        case "1m":
          ms = 60000;
          break;
        case "3m":
          ms = 180000;
          break;
        case "5m":
          ms = 300000;
          break;
        case "1h":
          ms = 3600000;
          break;
        case "6h":
          ms = 21600000;
          break;
      }

      const runSync = async () => {
        // Read the latest access token from a ref (in case it refreshed).
        const currentProj = projectsRef.current.find((p) => p.id === proj.id);
        if (!currentProj || !currentProj.autoSyncEnabled) return;

        try {
          console.log(`[Auto-Sync] Syncing "${currentProj.name}" (${currentProj.autoSyncInterval})...`);
          const res = await fetch(`/api/projects/${proj.id}/sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "x-user-email": user.email || "",
            },
          });
          if (res.ok) {
            const data = await res.json();
            console.log(`[Auto-Sync] Done "${currentProj.name}": ${data.photoCount} photos`);
            loadProjects();
          }
        } catch (err) {
          console.error(`[Auto-Sync] Failed for "${currentProj.name}":`, err);
        }
      };

      // Fire immediately on mount (so realtime sync kicks in right away),
      // then on the interval. Use setTimeout for the immediate fire so it
      // doesn't block the initial render.
      const immediateTimer = setTimeout(runSync, 2000);
      const intervalId = setInterval(runSync, ms);
      intervals.push(immediateTimer, intervalId);
    });

    return () => {
      intervals.forEach((id) => clearInterval(id));
    };
  }, [
    accessToken,
    user,
    projects
      .filter((p) => p.autoSyncEnabled)
      .map((p) => `${p.id}-${p.autoSyncInterval}`)
      .join(","),
  ]);

  return (
    <div
      className={`bg-[#0c0714] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-100 ${
        selectedProjectId ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* Top Banner Navigation */}
      <Header
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
        role={role}
        onLogoClick={handleLogoClick}
      />

      {/* Main Core Area */}
      <main
        className={`flex-1 w-full mx-auto flex flex-col ${
          selectedProjectId
            ? "px-4 sm:px-6 lg:px-8 py-4 md:py-6 overflow-hidden min-h-0 max-w-none"
            : "max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-12"
        }`}
      >
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
            userEmail={user?.email || undefined}
          />
        ) : (
          <div className="space-y-12">
            {/* Spectacular Hero Banner */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#4C2A85] via-[#1c0f33] to-[#0C061A] border-2 border-[#D4AF37]/25 p-8 md:p-12 shadow-2xl">
              <div className="absolute top-0 left-0 w-96 h-96 bg-[#4C2A85]/20 rounded-full filter blur-[100px] pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#D4AF37]/5 rounded-full filter blur-[80px] pointer-events-none" />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left: Heading + description */}
                <div className="space-y-4 lg:col-span-7">
                  <span className="inline-flex items-center space-x-2 bg-[#D4AF37]/15 text-[#D4AF37] px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-[#D4AF37]/30">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Gerbang Galeri Publik</span>
                  </span>
                  <h1 className="text-3xl md:text-5xl font-extrabold font-serif text-white tracking-wide leading-tight">
                    LIHUM
                    <span className="text-[#D4AF37]">: Lihat, Unduh Mandiri!</span>
                  </h1>
                  <p className="text-slate-200 text-sm md:text-base leading-relaxed font-light">
                    Media berbagi foto kegiatan, pengunjung bebas memilih dan
                    mengunduh foto langsung di halaman galeri yang dibagikan
                    secara mandiri.
                  </p>
                </div>

                {/* Right: Decorative gallery preview + feature badges (desktop only) */}
                <div className="hidden lg:flex lg:col-span-5 relative h-72 items-center justify-center">
                  {/* Stacked photo frames — fanned arrangement */}
                  <div className="relative w-full h-full">
                    {/* Back frame */}
                    <div className="absolute top-2 left-6 w-44 h-52 rounded-2xl bg-gradient-to-br from-[#1F0F3D] to-[#0C061A] border border-[#D4AF37]/20 shadow-2xl rotate-[-8deg] overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#4C2A85]/30 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera className="w-10 h-10 text-[#D4AF37]/30" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-[#0C061A] to-transparent">
                        <div className="h-1.5 w-3/4 bg-[#D4AF37]/30 rounded-full mb-1" />
                        <div className="h-1 w-1/2 bg-slate-500/30 rounded-full" />
                      </div>
                    </div>

                    {/* Middle frame */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-44 h-52 rounded-2xl bg-gradient-to-br from-[#4C2A85] to-[#1F0F3D] border border-[#D4AF37]/40 shadow-2xl rotate-[2deg] overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/10 to-transparent" />
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#D4AF37] text-[#4C2A85] text-[8px] font-bold uppercase tracking-wider">
                        Galeri
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="grid grid-cols-2 gap-1.5 p-3">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="w-9 h-9 rounded bg-gradient-to-br from-[#D4AF37]/40 to-[#4C2A85]/40 border border-[#D4AF37]/20"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-[#0C061A] to-transparent">
                        <div className="h-1.5 w-2/3 bg-[#D4AF37]/50 rounded-full mb-1" />
                        <div className="h-1 w-1/3 bg-slate-400/40 rounded-full" />
                      </div>
                    </div>

                    {/* Front frame */}
                    <div className="absolute top-6 right-2 w-44 h-52 rounded-2xl bg-gradient-to-br from-[#F8F9FA] to-[#E8E9EB] border-2 border-[#D4AF37]/60 shadow-2xl rotate-[10deg] overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent" />
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#4C2A85] text-[#D4AF37] text-[8px] font-bold uppercase tracking-wider">
                        Unduh
                      </div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center">
                          <Download className="w-6 h-6 text-[#4C2A85]" />
                        </div>
                        <div className="h-1.5 w-16 bg-slate-400/40 rounded-full" />
                        <div className="h-1 w-10 bg-slate-300/40 rounded-full" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-slate-200/40 to-transparent">
                        <div className="h-1.5 w-3/4 bg-[#4C2A85]/30 rounded-full mb-1" />
                        <div className="h-1 w-2/5 bg-slate-400/40 rounded-full" />
                      </div>
                    </div>
                  </div>

                  {/* Floating feature badge */}
                  <div className="absolute bottom-2 left-0 flex items-center gap-1.5 bg-[#1F0F3D]/90 border border-[#D4AF37]/30 rounded-full px-3 py-1.5 shadow-lg backdrop-blur-sm">
                    <QrCode className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span className="text-[10px] font-mono text-slate-200 font-bold tracking-wide">
                      QR Share
                    </span>
                  </div>
                </div>
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
                  Email Anda{" "}
                  <code className="bg-[#0C061A] border border-[#D4AF37]/20 px-2 py-1 rounded text-[#D4AF37] font-mono text-xs">
                    {user.email}
                  </code>{" "}
                  telah masuk dengan aman melalui Google Auth, tetapi belum
                  didaftarkan sebagai <strong>Admin</strong> atau{" "}
                  <strong>Manajer</strong> di sistem LIHUM.
                </p>
                <p className="text-xs text-slate-400">
                  Silakan hubungi Admin Utama (synclicen@gmail.com) agar email
                  Anda didaftarkan untuk mendapatkan izin akses mengelola &amp;
                  membagikan galeri kegiatan.
                </p>
                <button
                  onClick={handleLogout}
                  className="mt-2 inline-flex items-center justify-center py-2 px-5 rounded-xl bg-red-700/45 text-red-200 hover:bg-red-900/30 border border-red-900/40 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98]"
                >
                  Keluar Akun
                </button>
              </div>
            )}

            {/* Admin panel */}
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
                        <span>
                          Panel{" "}
                          {role === "admin" ? "Administrator" : "Manajer"} Aktif
                        </span>
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
                  <p className="text-xs text-slate-400">
                    Silakan pilih destinasi di bawah ini untuk melihat foto-foto
                    yang dibagikan.
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
                  <span className="text-xs text-slate-400 font-mono">
                    Memuat galeri kegiatan...
                  </span>
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-20 bg-[#120A21] border border-dashed border-[#D4AF37]/30 rounded-2xl">
                  <ImageIcon className="w-12 h-12 text-[#D4AF37]/45 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">
                    Belum ada galeri kegiatan publik yang tersedia saat ini.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Harap beralih masuk sebagai Admin di menu kanan atas untuk
                    mendaftarkan lokasi baru.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.filter((p) => !p.isHidden).map((project) => {
                    return (
                      <div
                        key={project.id}
                        onClick={() => handleSelectProject(project.id)}
                        className="group relative bg-white text-slate-800 border-2 border-slate-100 hover:border-[#D4AF37] rounded-2xl p-6 cursor-pointer transform hover:translate-y-[-4px] hover:shadow-2xl transition-all duration-300 flex flex-col justify-between"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#4C2A85]/5 to-[#D4AF37]/5 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300 pointer-events-none" />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4AF37] font-semibold bg-[#1F0F3D] px-2 py-0.5 rounded shrink-0">
                              LIHUM: Lihat, Unduh Mandiri!
                            </span>
                            <div className="flex items-center space-x-1 shrink-0">
                              <span
                                className={`text-[9px] px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1 border font-semibold ${
                                  project.displayMode === "all"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                    : "bg-amber-50 text-amber-600 border-amber-100"
                                }`}
                              >
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
                              {project.visibility === "private" && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full inline-flex items-center border font-semibold bg-red-50 text-red-600 border-red-100">
                                  <Lock className="w-2.5 h-2.5 mr-0.5 text-red-500" />
                                  <span>Privat</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <h3 className="text-lg font-serif font-bold text-slate-900 group-hover:text-[#4C2A85] transition-colors leading-snug">
                            {project.name}
                          </h3>

                          <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                            {project.description ||
                              "Temukan kumpulan keindahan foto kegiatan di sini."}
                          </p>
                        </div>

                        {/* Public Action foot */}
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                          <span className="font-mono bg-[#1F0F3D] text-[#D4AF37] py-1 px-3 rounded-full font-bold">
                            {project.photoCount} Foto
                          </span>

                          <div
                            className="flex items-center space-x-2"
                            onClick={(e) => e.stopPropagation()}
                          >
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

      {/* Luxury Footer */}
      <footer
        className={`bg-[#120A21] border-t border-[#D4AF37]/20 text-center shrink-0 ${
          selectedProjectId ? "py-4" : "py-8"
        }`}
      >
        {/* Baris 1 — sans-serif, emas, dengan copyright */}
        <p
          className={`font-sans font-semibold tracking-wide text-[#D4AF37] ${
            selectedProjectId ? "text-[10px]" : "text-xs"
          }`}
        >
          &copy; 2026 &middot; Made by Fajrianor
        </p>
        {/* Baris 2 — serif (Playfair Display), putih, judul */}
        <p
          className={`font-serif font-bold tracking-wide text-white mt-1 ${
            selectedProjectId ? "text-[11px]" : "text-sm"
          }`}
        >
          LIHUM: Lihat, Unduh Mandiri!
        </p>
        {/* Baris 3 — mono (JetBrains Mono), slate, institusi */}
        <p
          className={`font-mono tracking-wider text-slate-400 mt-1 ${
            selectedProjectId ? "text-[9px]" : "text-[10px]"
          }`}
        >
          Pusat Humas dan Keterbukaan Informasi &middot; UIN Antasari Banjarmasin
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
