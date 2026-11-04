"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import Header from "@/components/lihum/Header";
import AdminPanel from "@/components/lihum/AdminPanel";
import GalleryView from "@/components/lihum/GalleryView";
import ShareModal from "@/components/lihum/ShareModal";
import MaintenanceScreen from "@/components/lihum/MaintenanceScreen";
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
  Eye,
  QrCode,
  Camera,
  Search,
  ArrowUpDown,
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

  // ── Maintenance Mode state ──
  // When maintenance is enabled AND the user is NOT an admin/manager,
  // we render MaintenanceScreen instead of the normal UI. Admins always bypass.
  // Polled every 60s so visitors see the maintenance screen within ~1 min
  // of an admin enabling it, and return to normal within ~1 min of disabling.
  const [maintenance, setMaintenance] = useState<{
    enabled: boolean;
    message: string;
  } | null>(null);

  // Gallery search + sort (client-side, 0 Worker requests)
  const [gallerySearch, setGallerySearch] = useState("");
  const [gallerySort, setGallerySort] = useState<"newest" | "oldest" | "name-az" | "name-za">("newest");

  const visibleGalleries = projects
    .filter((p) => !p.isHidden)
    .filter((p) => {
      if (!gallerySearch.trim()) return true;
      const q = gallerySearch.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (gallerySort) {
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "name-az":
          return a.name.localeCompare(b.name);
        case "name-za":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

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
            // Save refresh token to server so background sync can run 24/7
            // without admin keeping a tab open. Fire-and-forget (non-blocking).
            if (result.refreshToken) {
              fetch("/api/settings/drive-sync-token", {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-email": result.user.email || "",
                },
                body: JSON.stringify({
                  refreshToken: result.refreshToken,
                  userEmail: result.user.email,
                }),
              }).catch((err) =>
                console.warn("Failed to save refresh token:", err)
              );
            }
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

  // Polling for latest metadata. Only admins/managers poll — visitors don't
  // need real-time gallery list updates (gallery counts rarely change during
  // a live event). This saves ~1.4M Worker requests/day at 10K concurrent
  // visitors. Visitors see the latest list on page load / manual refresh.
  useEffect(() => {
    if (role === null) return; // non-admin: no polling
    const fetchMetadataInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadProjects();
      }
    }, 300000); // 5m

    return () => clearInterval(fetchMetadataInterval);
  }, [role]);

  // ── Maintenance Mode checker ──
  //
  // Polls /api/settings/maintenance periodically (only when tab visible).
  // If enabled AND user is not admin/manager, renders MaintenanceScreen.
  // Admins always bypass — they need to access the panel to disable it.
  //
  // ADAPTIVE INTERVAL for high-traffic events (e.g., wisuda 20K visitors):
  //   - Admin/manager: poll every 60s (need real-time status for management)
  //   - Non-admin visitors: poll every 5m (300s) — visitors don't need
  //     instant maintenance detection; 5 min latency is acceptable and
  //     saves ~144M Worker requests/day at 20K concurrent visitors.
  useEffect(() => {
    // Admins poll faster (need to verify maintenance is working + disable it).
    // Non-admin visitors poll slowly (5 min) to conserve Workers quota.
    const pollInterval = role !== null ? 60000 : 300000;

    const checkMaintenance = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/settings/maintenance");
        if (!res.ok) return;
        const data = await res.json();
        setMaintenance({ enabled: !!data.enabled, message: data.message || "" });
      } catch (err) {
        // Network error — keep last known state (don't blank the screen
        // during a transient blip). If maintenance was enabled, the visitor
        // should continue seeing the maintenance screen.
      }
    };
    checkMaintenance();
    const id = setInterval(checkMaintenance, pollInterval);
    return () => clearInterval(id);
  }, [role]);

  // ── Smart Auto-Sync Scheduler ──
  //
  // RE-ENABLED with TRUE DELTA sync. The previous auto-sync was removed because
  // replaceProjectPhotos ran INSERT OR REPLACE on EVERY photo every cycle,
  // counting each as a D1 row write — even when the data was byte-identical.
  // That blew through the 100K writes/day D1 free-tier limit.
  //
  // Now replaceProjectPhotos computes a true delta: it only writes rows that
  // are genuinely new or changed, and only deletes rows that are gone. A sync
  // of an unchanged Drive folder costs **0 D1 writes**. This makes background
  // auto-sync safe under the free-tier limit.
  //
  // Safety guards (all enforced here, in the frontend):
  //   1. Only runs when admin/manager is logged in (needs their OAuth token).
  //   2. Only runs when the browser tab is visible (skips when backgrounded —
  //      saves Workers requests + Drive API calls).
  //   3. Minimum effective interval: 5 minutes. Legacy "30s"/"1m"/"3m"
  //      values stored in the DB are clamped up to 5m automatically.
  //   4. Maximum 5 galleries with auto-sync enabled (UI also enforces this).
  //   5. Syncs are staggered by 15s per gallery to spread CPU + Drive API
  //      load, so 5 galleries don't all fire at the same instant.
  //
  // Daily cost at full load (5 galleries × 5m interval):
  //   - D1 reads:       ~2,880/day  (0.06% of 5M/day limit)
  //   - D1 writes:      0 when folders unchanged; ~N when N photos added
  //   - Workers reqs:   ~1,440/day  (1.4% of 100K/day limit)
  //   - Drive API calls: ~7,200/day  (well within Google's quota)
  const projectsRef = useRef<ProjectSummary[]>([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // ── Drive Push Notification needsSync checker ──
  //
  // Google Drive sends a push notification to our /api/drive-webhook when any
  // file in the admin's Drive changes. The webhook marks needsSync=1 on all
  // of the admin's auto-sync galleries. This checker polls /api/needs-sync
  // every 60s to detect that flag, and triggers an immediate delta-sync for
  // any flagged gallery — bypassing the normal 5m interval.
  //
  // Why 60s? It's the sweet spot:
  //   - Fast enough that Drive changes appear in the gallery within 1 minute
  //     (vs 5 minutes with pure polling)
  //   - Slow enough that D1 reads are minimal (1,440 reads/day = 0.03% of limit)
  //
  // Cost: 1 D1 read per 60s = 1,440 reads/day = 0.03% of the 5M/day limit.
  // Sync writes only happen when Drive actually changed (true delta = 0 writes
  // when nothing changed). This replaces wasteful 5m polling of Google Drive
  // with cheap D1 flag checks.
  useEffect(() => {
    if (!accessToken || !user) return;

    const checkNeedsSync = async () => {
      // Skip if tab not visible — saves Workers requests.
      if (document.visibilityState !== "visible") return;

      try {
        const res = await fetch("/api/needs-sync", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-user-email": user.email || "",
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        const needingSync: string[] = data.needsSync || [];
        if (needingSync.length === 0) return;

        // Trigger immediate sync for each flagged gallery.
        // We do them sequentially (not in parallel) to avoid CPU spikes.
        for (const projectId of needingSync) {
          const proj = projectsRef.current.find((p) => p.id === projectId);
          if (!proj) continue;
          try {
            const syncRes = await fetch(`/api/projects/${projectId}/sync`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "x-user-email": user.email || "",
              },
            });
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              if (syncData.syncDelta) {
                const { upserted, deleted, unchanged } = syncData.syncDelta;
                if (upserted > 0 || deleted > 0) {
                  console.log(
                    `[Push] "${proj.name}": +${upserted} new, -${deleted} removed, ${unchanged} unchanged (push notification)`
                  );
                  loadProjects();
                } else {
                  console.log(
                    `[Push] "${proj.name}": no actual changes (${unchanged} unchanged) — Drive change didn't affect this gallery`
                  );
                }
              }
            }
          } catch (err) {
            console.error(`[Push] Sync failed for "${proj.name}":`, err);
          }
        }
      } catch (err) {
        console.error("[Push] needsSync check failed:", err);
      }
    };

    // Check immediately on mount, then every 60s.
    checkNeedsSync();
    const intervalId = setInterval(checkNeedsSync, 60000);

    return () => clearInterval(intervalId);
    // Re-create only when auth changes (not on every projects update —
    // projectsRef keeps the latest list without re-triggering this effect).
  }, [accessToken, user]);

  useEffect(() => {
    if (!accessToken || !user) return;

    const allSyncedProjects = projectsRef.current.filter((p) => p.autoSyncEnabled);
    if (allSyncedProjects.length === 0) return;

    // SAFETY: limit to max 5 galleries to stay within D1/Workers quotas.
    const syncedProjects = allSyncedProjects.slice(0, 5);
    if (allSyncedProjects.length > 5) {
      console.warn(
        `[Auto-Sync] ${allSyncedProjects.length} galleries have auto-sync enabled, but only 5 will be synced. Disable others or use manual sync.`
      );
    }

    const intervalTimers: ReturnType<typeof setInterval>[] = [];
    const startDelays: ReturnType<typeof setTimeout>[] = [];

    syncedProjects.forEach((proj, index) => {
      // Stagger first-run by 15s per gallery to avoid CPU spikes.
      const staggerMs = index * 15000;

      // Parse interval, clamping to 5m minimum.
      // Legacy "30s"/"1m"/"3m" values are upgraded to 5m automatically.
      let intervalMs = 300000; // default 5m
      switch (proj.autoSyncInterval) {
        case "5m": intervalMs = 300000; break;
        case "15m": intervalMs = 900000; break;
        case "30m": intervalMs = 1800000; break;
        case "1h": intervalMs = 3600000; break;
        case "6h": intervalMs = 21600000; break;
        // Legacy values — clamp to 5m
        case "30s":
        case "1m":
        case "3m":
        default:
          intervalMs = 300000;
          break;
      }

      const runSync = async () => {
        // Skip if tab is not visible — saves Workers requests + Drive API calls.
        if (document.visibilityState !== "visible") return;

        const currentProj = projectsRef.current.find((p) => p.id === proj.id);
        if (!currentProj || !currentProj.autoSyncEnabled) return;

        try {
          const res = await fetch(`/api/projects/${proj.id}/sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "x-user-email": user.email || "",
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.syncDelta) {
              const { upserted, deleted, unchanged } = data.syncDelta;
              if (upserted > 0 || deleted > 0) {
                console.log(
                  `[Auto-Sync] "${currentProj.name}": +${upserted} new, -${deleted} removed, ${unchanged} unchanged`
                );
                // Refresh gallery counts only when something actually changed.
                loadProjects();
              } else {
                console.log(
                  `[Auto-Sync] "${currentProj.name}": ${unchanged} unchanged (0 D1 writes)`
                );
              }
            }
          }
        } catch (err) {
          console.error(`[Auto-Sync] Failed for "${currentProj.name}":`, err);
        }
      };

      // Stagger the first run, then set up the recurring interval.
      const startTimer = setTimeout(() => {
        runSync();
        const intervalId = setInterval(runSync, intervalMs);
        intervalTimers.push(intervalId);
      }, staggerMs);
      startDelays.push(startTimer);
    });

    return () => {
      startDelays.forEach(clearTimeout);
      intervalTimers.forEach(clearInterval);
    };
    // Re-create scheduler only when the SET of auto-sync galleries changes.
    // loadProjects() updating photoCount/lastSyncedAt does NOT trigger this
    // (those fields aren't in the dependency string), so the scheduler is
    // stable across data refreshes.
  }, [
    accessToken,
    user,
    projects
      .filter((p) => p.autoSyncEnabled)
      .map((p) => `${p.id}-${p.autoSyncInterval}`)
      .join(","),
  ]);

  // ── Maintenance Mode gate ──
  //
  // If maintenance is enabled AND the current user is NOT an admin/manager,
  // render the MaintenanceScreen instead of the normal UI. Admins always
  // bypass so they can access the panel to disable maintenance.
  //
  // We wait for the maintenance status to be loaded (non-null) before showing
  // the screen, to avoid flashing it during initial page load.
  const showMaintenanceScreen =
    maintenance?.enabled === true && role === null && !isAdminMode;

  if (showMaintenanceScreen) {
    return (
      <MaintenanceScreen
        message={maintenance?.message}
        onRetry={() => {
          // Re-fetch maintenance status immediately.
          fetch("/api/settings/maintenance")
            .then((r) => r.json())
            .then((data) =>
              setMaintenance({
                enabled: !!data.enabled,
                message: data.message || "",
              })
            )
            .catch(() => {
              // If fetch fails, reload the whole page as a fallback.
              window.location.reload();
            });
        }}
      />
    );
  }

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
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#D4AF37]/15">
                <h2 className="text-lg md:text-xl font-bold font-serif text-[#D4AF37] tracking-wide">
                  Pilih Galeri Foto Kegiatan
                </h2>
                {!loading && visibleGalleries.length > 0 && (
                  <span className="text-xs bg-[#120A21] text-[#D4AF37] border border-[#D4AF37]/30 py-1 px-2.5 rounded-full font-mono font-bold shrink-0">
                    {visibleGalleries.length} Galeri
                  </span>
                )}
              </div>

              {/* Search + Sort bar */}
              {!loading && visibleGalleries.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="text"
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      placeholder="Cari galeri..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg bg-white border-none shadow-md text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37] placeholder-slate-400 transition-all font-sans"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <div className="relative shrink-0">
                    <ArrowUpDown className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    <select
                      value={gallerySort}
                      onChange={(e) => setGallerySort(e.target.value as any)}
                      className="h-8 pl-6 pr-6 rounded-lg bg-white border-none shadow-md text-slate-700 text-[10px] focus:outline-none focus:ring-2 focus:ring-[#D4AF37] appearance-none cursor-pointer font-sans"
                    >
                      <option value="newest">Terbaru</option>
                      <option value="oldest">Terlama</option>
                      <option value="name-az">Nama (A-Z)</option>
                      <option value="name-za">Nama (Z-A)</option>
                    </select>
                    <svg className="w-2.5 h-2.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
                  <span className="text-xs text-slate-400 font-mono">
                    Memuat galeri kegiatan...
                  </span>
                </div>
              ) : visibleGalleries.length === 0 ? (
                <div className="text-center py-20 bg-[#120A21] border border-dashed border-[#D4AF37]/30 rounded-2xl">
                  <ImageIcon className="w-12 h-12 text-[#D4AF37]/45 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">
                    {gallerySearch ? "Tidak ada galeri yang cocok dengan pencarian." : "Belum ada galeri kegiatan publik yang tersedia."}
                  </p>
                </div>
              ) : (
                /* Compact gallery grid — 4 columns on desktop, more cards per screen */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {visibleGalleries.map((project) => (
                    <div
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className="group relative bg-white text-slate-800 border border-slate-200 hover:border-[#D4AF37] rounded-xl p-3 cursor-pointer transform hover:translate-y-[-2px] hover:shadow-lg transition-all duration-200 flex flex-col"
                    >
                      {/* Badges row */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[8px] font-mono uppercase tracking-wider text-[#D4AF37] font-bold bg-[#1F0F3D] px-1.5 py-0.5 rounded">
                          LIHUM
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full inline-flex items-center border font-semibold ${
                            project.displayMode === "all"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : "bg-amber-50 text-amber-600 border-amber-100"
                          }`}>
                            {project.displayMode === "all" ? <Globe className="w-2 h-2" /> : <Lock className="w-2 h-2" />}
                          </span>
                          {project.visibility === "private" && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full inline-flex items-center border font-semibold bg-red-50 text-red-600 border-red-100">
                              <Lock className="w-2 h-2" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-xs font-bold font-serif text-slate-900 group-hover:text-[#4C2A85] transition-colors leading-tight line-clamp-2 mb-1">
                        {project.name}
                      </h3>

                      {/* Description */}
                      <p className="text-[10px] text-slate-500 line-clamp-1 leading-relaxed mb-2 flex-grow">
                        {project.description || "Kumpulan foto kegiatan."}
                      </p>

                      {/* Footer: photo count + views + downloads + open */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[9px] font-mono bg-[#1F0F3D] text-[#D4AF37] py-0.5 px-2 rounded-full font-bold">
                          {project.photoCount} Foto
                        </span>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {(project.viewCount || 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[8.5px] text-slate-400 font-mono"
                              title={`${project.viewCount?.toLocaleString("id-ID")} kunjungan`}
                            >
                              <Eye className="w-2.5 h-2.5" />
                              {project.viewCount! >= 1000
                                ? `${(project.viewCount! / 1000).toFixed(1)}k`
                                : project.viewCount}
                            </span>
                          )}
                          {(project.downloadCount || 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[8.5px] text-slate-400 font-mono"
                              title={`${project.downloadCount?.toLocaleString("id-ID")} unduhan`}
                            >
                              <Download className="w-2.5 h-2.5" />
                              {project.downloadCount! >= 1000
                                ? `${(project.downloadCount! / 1000).toFixed(1)}k`
                                : project.downloadCount}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setShareProject(project)}
                            className="p-1 rounded text-slate-300 hover:text-[#4C2A85] hover:bg-slate-100 transition-colors"
                            title="Bagikan galeri"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                          <span
                            onClick={() => handleSelectProject(project.id)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-700 hover:text-[#4C2A85] transition-colors cursor-pointer"
                          >
                            Buka
                            <ArrowRight className="w-2.5 h-2.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
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
