"use client";

import React, { useState, useEffect } from "react";
import type { ProjectSummary } from "@/types";
import {
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Sliders,
  HelpCircle,
  ExternalLink,
  Library,
  CheckCircle,
  AlertCircle,
  Info,
  Lock,
  Globe,
  Share2,
  Users,
  UserPlus,
  Shield,
  Trash,
  Eye,
  EyeOff,
  Sparkles,
  Inbox,
  Download,
  KeyRound,
  CloudUpload,
  Mail,
  Settings,
  ShieldCheck,
  AlertTriangle,
  Database,
  Server,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";

interface AdminPanelProps {
  projects: ProjectSummary[];
  accessToken: string;
  onRefresh: () => void;
  onSelectProject: (id: string, isAdminSelection: boolean) => void;
  onShare?: (proj: ProjectSummary) => void;
  userEmail: string;
  userRole: "admin" | "manager";
}

export default function AdminPanel({
  projects,
  accessToken,
  onRefresh,
  onSelectProject,
  onShare,
  userEmail,
  userRole,
}: AdminPanelProps) {
  // Tab control state
  const [activeTab, setActiveTab] = useState<
    "projects" | "accounts" | "settings"
  >("projects");

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [displayMode, setDisplayMode] = useState<"all" | "search">("all");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoFilterEnabled, setAutoFilterEnabled] = useState(false);
  const [allowVisitorUpload, setAllowVisitorUpload] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<
    "30s" | "1m" | "3m" | "5m" | "1h" | "6h"
  >("3m");

  // Account form/management states
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager">("manager");

  const [isLoading, setIsLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [togglingHideId, setTogglingHideId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Confirmation Modal states
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<{
    id: string;
    email: string;
  } | null>(null);

  // ── Pending visitor uploads (admin review) state ──
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [pendingTotal, setPendingTotal] = useState(0);
  const [saConfigured, setSaConfigured] = useState<boolean | null>(null);
  const [pendingViewer, setPendingViewer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [deletingPendingId, setDeletingPendingId] = useState<string | null>(
    null
  );
  const [clearingPending, setClearingPending] = useState(false);

  // ── Settings tab state (admin only) ──
  const [settingsData, setSettingsData] = useState<{
    serviceAccount: {
      configured: boolean;
      clientEmail: string | null;
      source: string | null;
    };
    stats: {
      projects: number;
      photos: number;
      accounts: number;
      pendingUploads: number;
      pendingStorageBytes: number;
    };
    app: {
      appUrl: string;
      databaseUrl: string;
      nodeEnv: string;
    };
  } | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saJsonInput, setSaJsonInput] = useState("");
  const [savingSa, setSavingSa] = useState(false);
  const [deletingSa, setDeletingSa] = useState(false);
  const [testingSa, setTestingSa] = useState(false);
  const [saTestResult, setSaTestResult] = useState<{
    success: boolean;
    message: string;
    driveUser?: string;
  } | null>(null);
  const [showSaInstructions, setShowSaInstructions] = useState(false);
  const [clearingAllPending, setClearingAllPending] = useState(false);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setDriveFolderUrl("");
    setDisplayMode("all");
    setVisibility("public");
    setPassword("");
    setAutoSyncEnabled(false);
    setAutoFilterEnabled(false);
    setAllowVisitorUpload(false);
    setAutoSyncInterval("3m");
    setErrorMsg("");
  };

  const handleEditClick = (project: ProjectSummary) => {
    setIsEditing(true);
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description);
    setDriveFolderUrl(project.driveFolderUrl);
    setDisplayMode(project.displayMode);
    setVisibility(project.visibility || "public");
    setPassword(""); // never pre-fill — admin can leave empty to keep existing
    setAutoSyncEnabled(!!project.autoSyncEnabled);
    setAutoFilterEnabled(!!project.autoFilterEnabled);
    setAllowVisitorUpload(!!project.allowVisitorUpload);
    setAutoSyncInterval(project.autoSyncInterval || "3m");
    setErrorMsg("");
  };

  // Fetch Accounts from server
  const loadAccounts = async () => {
    if (userRole !== "admin") return;
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/accounts", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat daftar akun.");
      const data = await res.json();
      setAccounts(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Gagal memuat daftar akun dari server.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  // React to tab change
  useEffect(() => {
    if (activeTab === "accounts" && userRole === "admin") {
      loadAccounts();
    }
    if (activeTab === "settings" && userRole === "admin") {
      loadSettings();
    }
  }, [activeTab, userRole]);

  // Load pending upload counts + SA status whenever projects refresh.
  const loadPendingCounts = async () => {
    try {
      const res = await fetch("/api/pending-uploads", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPendingCounts(data.counts || {});
      setPendingTotal(data.total || 0);
      setSaConfigured(!!data.serviceAccountConfigured);
    } catch {
      /* non-critical */
    }
  };

  // Load pending upload counts + SA status on mount, and whenever the number
  // of galleries changes (create/delete). We intentionally do NOT depend on
  // `onRefresh` here — it's a plain function (not useCallback'd) in the
  // parent, so depending on it would cause an infinite re-fetch loop:
  // effect fires → setState → re-render → new onRefresh ref → effect fires…
  useEffect(() => {
    loadPendingCounts();
  }, [projects.length]);

  const openPendingViewer = async (projectId: string, projectName: string) => {
    setPendingViewer({ id: projectId, name: projectName });
    setPendingList([]);
    setLoadingPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/pending-uploads`, {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat upload pending.");
      const data = await res.json();
      setPendingList(data.uploads || []);
      setSaConfigured(!!data.serviceAccountConfigured);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memuat upload pending.");
      setPendingViewer(null);
    } finally {
      setLoadingPending(false);
    }
  };

  const downloadPendingUpload = (uploadId: string) => {
    // Direct browser navigation triggers a file download (Content-Disposition: attachment).
    // Auth via cookie isn't available for this admin route; the admin email is
    // passed as a query param fallback so the fetch is associated with the admin.
    const link = document.createElement("a");
    link.href = `/api/pending-uploads/${uploadId}?admin=${encodeURIComponent(userEmail)}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deletePendingUpload = async (uploadId: string) => {
    setDeletingPendingId(uploadId);
    try {
      const res = await fetch(`/api/pending-uploads/${uploadId}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal menghapus.");
      setPendingList((prev) => prev.filter((u) => u.id !== uploadId));
      loadPendingCounts();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus upload.");
    } finally {
      setDeletingPendingId(null);
    }
  };

  const clearAllPending = async () => {
    if (!pendingViewer) return;
    setClearingPending(true);
    try {
      const res = await fetch(`/api/projects/${pendingViewer.id}/pending-uploads`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal menghapus semua.");
      setPendingList([]);
      loadPendingCounts();
      setSuccessMsg("Semua upload pending dihapus.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus semua upload.");
    } finally {
      setClearingPending(false);
    }
  };

  // ── Settings tab handlers (admin only) ──
  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat pengaturan.");
      const data = await res.json();
      setSettingsData(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memuat pengaturan.");
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveSa = async () => {
    if (!saJsonInput.trim()) {
      setErrorMsg("Tempel JSON key terlebih dahulu.");
      return;
    }
    setSavingSa(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSaTestResult(null);
    try {
      const res = await fetch("/api/settings/service-account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({ serviceAccount: saJsonInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menyimpan Service Account.");
      }
      setSuccessMsg(data.message || "Service Account berhasil disimpan.");
      setSaJsonInput("");
      loadSettings();
      loadPendingCounts();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan Service Account.");
    } finally {
      setSavingSa(false);
    }
  };

  const handleDeleteSa = async () => {
    setDeletingSa(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSaTestResult(null);
    try {
      const res = await fetch("/api/settings/service-account", {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus Service Account.");
      }
      setSuccessMsg(data.message || "Service Account dihapus.");
      loadSettings();
      loadPendingCounts();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus Service Account.");
    } finally {
      setDeletingSa(false);
    }
  };

  const handleTestSa = async () => {
    setTestingSa(true);
    setSaTestResult(null);
    setErrorMsg("");
    try {
      const res = await fetch("/api/settings/service-account/test", {
        method: "POST",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json();
      setSaTestResult({
        success: !!data.success,
        message: data.message || data.error || "",
        driveUser: data.driveUser?.emailAddress,
      });
    } catch (err: any) {
      setSaTestResult({
        success: false,
        message: err.message || "Gagal terhubung ke server.",
      });
    } finally {
      setTestingSa(false);
    }
  };

  const handleClearAllPendingGlobal = async () => {
    setClearingAllPending(true);
    try {
      // Clear pending uploads for ALL projects by calling the per-project
      // delete endpoint for each project that has pending count > 0.
      const projectsWithPending = Object.entries(pendingCounts).filter(
        ([, count]) => count > 0
      );
      await Promise.all(
        projectsWithPending.map(([pid]) =>
          fetch(`/api/projects/${pid}/pending-uploads`, {
            method: "DELETE",
            headers: { "x-user-email": userEmail },
          })
        )
      );
      setSuccessMsg(
        `Berhasil menghapus ${pendingTotal} upload pending dari ${projectsWithPending.length} galeri.`
      );
      loadSettings();
      loadPendingCounts();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus upload pending.");
    } finally {
      setClearingAllPending(false);
    }
  };

  const copyToClipboard = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setSuccessMsg("Tersalin ke clipboard.");
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch {
      /* ignore */
    }
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
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          name,
          description,
          driveFolderUrl,
          displayMode,
          visibility,
          password: visibility === "private" ? password : undefined,
          autoFilterEnabled,
          allowVisitorUpload,
          autoSyncEnabled,
          autoSyncInterval,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan galeri.");
      }

      setSuccessMsg(
        editingId ? "Galeri berhasil diperbarui!" : "Galeri baru sukses dibuat!"
      );
      resetForm();
      onRefresh();

      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses galeri.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setProjectToDelete({ id, name });
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const { id } = projectToDelete;
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setProjectToDelete(null);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
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
          Authorization: `Bearer ${accessToken}`,
          "x-user-email": userEmail,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ditolak dari Google Drive.");
      }

      const data = await res.json();
      const folderInfo =
        data.foldersScanned && data.foldersScanned > 1
          ? ` dari ${data.foldersScanned} folder (termasuk subfolder)`
          : "";
      const driveInfo = data.isSharedDrive && data.sharedDriveName
        ? ` dari Shared Drive "${data.sharedDriveName}"`
        : "";
      const filterInfo = data.filteredStats
        ? ` (filter: ${data.filteredStats.smallFiles} file kecil difilter dari ${data.filteredStats.total} total)`
        : "";

      if (data.photoCount === 0) {
        // 0 photos — show diagnostic as ERROR (not success)
        const debugMsg = data.debug || "Folder mungkin hanya di-share via link tanpa akses eksplisit ke email admin.";
        setErrorMsg(`Sinkronisasi selesai tapi 0 foto ditemukan. ${debugMsg}`);
        onRefresh();
        return;
      }

      setSuccessMsg(
        `Sinkronisasi sukses! Berhasil memuat ${data.photoCount} foto${folderInfo}${driveInfo} dari Google Drive.${filterInfo}`
      );
      onRefresh();

      // If autoFilterEnabled is on, run AI quality scoring in background.
      // Admin doesn't need to do anything — this runs automatically after sync.
      // Photos are scored in batches of 5, with each batch as 1 Worker request.
      if (project.autoFilterEnabled && data.photoCount > 0) {
        setSuccessMsg(
          `Sync selesai (${data.photoCount} foto). Filter AI sedang berjalan di background...`
        );

        // Run AI scoring in background — don't block the UI
        (async () => {
          let offset = 0;
          let totalHidden = 0;
          let totalProcessed = 0;
          const total = data.photoCount;

          while (true) {
            try {
              const scoreRes = await fetch(`/api/projects/${projectId}/ai-score`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-user-email": userEmail,
                },
                body: JSON.stringify({ offset }),
              });

              if (!scoreRes.ok) {
                console.error("[AI-Background] Batch failed:", await scoreRes.text());
                break;
              }

              const scoreData = await scoreRes.json();
              totalHidden += scoreData.hidden || 0;
              totalProcessed += scoreData.processed || 0;
              offset = scoreData.offset;

              // Update progress message
          setSuccessMsg(
            `Filter AI berjalan... ${totalProcessed}/${total} foto diperiksa, ${totalHidden} disembunyikan`
          );

              if (scoreData.done) {
                break;
              }

              // Small delay between batches to be gentle on the server
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (err) {
              console.error("[AI-Background] Error:", err);
              break;
            }
          }

          setSuccessMsg(
            `Filter AI selesai! ${totalHidden} foto berkualitas rendah disembunyikan dari ${totalProcessed} total foto.`
          );
          onRefresh();
          setTimeout(() => setSuccessMsg(""), 5000);
        })();
      } else {
        // No AI filter — just auto open synced gallery
        setTimeout(() => {
          setSuccessMsg("");
          onSelectProject(projectId, false);
        }, 3000);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message ||
          'Gagal terhubung dengan Drive. Pastikan folder tersebut shared "Anyone with the link can view" atau login Anda belum kedaluwarsa.'
      );
    } finally {
      setSyncingId(null);
    }
  };

  // Toggle gallery visibility (hide/show from public home page)
  const handleToggleHide = async (project: ProjectSummary) => {
    setTogglingHideId(project.id);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({ isHidden: !project.isHidden }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mengubah visibilitas galeri.");
      }
      setSuccessMsg(
        project.isHidden
          ? `Galeri "${project.name}" sekarang tampil kembali di halaman publik.`
          : `Galeri "${project.name}" disembunyikan dari halaman publik.`
      );
      onRefresh();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Gagal mengubah visibilitas galeri.");
    } finally {
      setTogglingHideId(null);
    }
  };

  // Account additions/deletions Handlers
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setErrorMsg("Alamat email wajib diisi.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          displayName: newDisplayName.trim() || null,
          role: newRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mendaftarkan akun.");
      }

      setSuccessMsg(
        `Akun ${newEmail} sukses terdaftar sebagai ${
          newRole === "admin" ? "Admin" : "Manajer"
        }!`
      );
      setNewEmail("");
      setNewDisplayName("");
      setNewRole("manager");
      loadAccounts();

      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mendaftarkan akun.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = (id: string, email: string) => {
    setAccountToDelete({ id, email });
  };

  const confirmDeleteAccount = async () => {
    if (!accountToDelete) return;
    const { id, email } = accountToDelete;
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setAccountToDelete(null);

    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus hak akses.");
      }

      setSuccessMsg(`Hak akses bagi akun ${email} berhasil dicabut.`);
      loadAccounts();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mencabut hak akses.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Gallery Form Renderer ──
  // Renders the create/edit form. Used in two places:
  //  1. Inline in the left panel (for "create new" mode)
  //  2. Inside a modal popup (for "edit" mode — so admin doesn't scroll up)
  const renderGalleryForm = () => (
    <div className="bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl p-6 shadow-2xl relative backdrop-blur-sm self-start">
      <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-[#D4AF37]/15">
        <FolderKanban className="w-5 h-5 text-[#D4AF37]" />
        <h2 className="text-md font-serif font-bold text-white">
          {editingId ? "Ubah Pengaturan Galeri" : "Buat Galeri Baru"}
        </h2>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start space-x-2 p-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 rounded-lg text-xs mb-4">
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
            placeholder=""
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
            placeholder=""
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
              <span className="absolute bottom-full right-0 w-72 bg-slate-950 text-[10px] text-slate-300 p-2.5 rounded-lg border border-[#D4AF37]/20 shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none z-50">
                Pergi ke Google Drive, klik kanan folder, pilih Bagikan
                &gt; Siapa saja yang memiliki link dapat melihat. Lalu
                salin link-nya dan tempel di sini.{" "}
                <strong className="text-[#D4AF37]">
                  Semua subfolder di dalamnya akan otomatis ikut terscan
                </strong>{" "}
                — cocok untuk hasil foto yang sudah dikelompokkan per
                petugas.
              </span>
            </span>
          </label>
          <div className="relative">
            <input
              type="url"
              placeholder=""
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 transition-all"
              required
            />
          </div>
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
              <span className="text-[9px] text-slate-300 text-center font-normal">
                Seketika tampil saat diklik
              </span>
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
              <span className="text-[9px] text-slate-300 text-center font-normal">
                Wajib ketik nama untuk melihat
              </span>
            </button>
          </div>
        </div>

        {/* Visibility (Public/Private) Section */}
        <div>
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
            Siapa yang Bisa Melihat Foto?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`py-2 px-3.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                visibility === "public"
                  ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70 shadow-lg shadow-black/20"
                  : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Umum</span>
              </div>
              <span className="text-[9px] text-slate-300 text-center font-normal">
                Semua pengunjung bebas melihat
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`py-2 px-3.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                visibility === "private"
                  ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70 shadow-lg shadow-black/20"
                  : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Privat</span>
              </div>
              <span className="text-[9px] text-slate-300 text-center font-normal">
                Perlu password untuk membuka
              </span>
            </button>
          </div>
        </div>

        {/* Password field — only shown when visibility is private */}
        {visibility === "private" && (
          <div className="space-y-1.5 animate-fadeIn">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
              Password Galeri
            </label>
            <input
              type="text"
              placeholder={
                isEditing
                  ? ""
                  : ""
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-400 transition-all font-mono"
              autoComplete="off"
            />
            <p className="text-[10px] text-slate-400 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>
                Bagikan password ini hanya kepada kalangan yang Anda
                izinkan. Pengunjung lain akan diminta menghubungi admin.
              </span>
            </p>
          </div>
        )}

        {/* Visitor Upload Section */}
        <div className="border-t border-[#D4AF37]/15 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest">
              Upload Mandiri Pengunjung
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowVisitorUpload}
                onChange={(e) => setAllowVisitorUpload(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors"></div>
              <span className="ml-2.5 text-[10px] font-mono font-bold text-[#D4AF37]">
                {allowVisitorUpload ? "AKTIF" : "NONAKTIF"}
              </span>
            </label>
          </div>
          {allowVisitorUpload && (
            <div className="space-y-1.5 animate-fadeIn">
              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                Pengunjung dapat mengupload foto ke galeri via QR code upload.
                Maksimal 5 foto per sesi. Foto masuk ke folder Google Drive
                dan muncul setelah admin sinkron.
              </p>
              {saConfigured === true && (
                <div className="flex items-center gap-1.5 text-[9.5px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-2 py-1">
                  <CloudUpload className="w-3 h-3 shrink-0" />
                  <span>
                    Service Account aktif — foto langsung masuk ke Drive &amp;
                    galeri tersinkron otomatis.
                  </span>
                </div>
              )}
              {saConfigured === false && (
                <div className="flex items-start gap-1.5 text-[9.5px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-md px-2 py-1.5">
                  <KeyRound className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Mode fallback aktif: foto pengunjung disimpan sementara
                    untuk ditinjau admin (lihat ikon Inbox). Untuk upload
                    otomatis ke Drive, setel Google Service Account sebagai
                    Worker secret <code className="text-[#D4AF37]">GOOGLE_SERVICE_ACCOUNT</code> &amp;
                    tambahkan email SA sebagai Editor folder Drive.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Auto-Filter Section */}
        <div className="border-t border-[#D4AF37]/15 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest">
              Filter Foto Otomatis
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFilterEnabled}
                onChange={(e) => setAutoFilterEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors"></div>
              <span className="ml-2.5 text-[10px] font-mono font-bold text-[#D4AF37]">
                {autoFilterEnabled ? "AKTIF" : "NONAKTIF"}
              </span>
            </label>
          </div>
          {autoFilterEnabled && (
            <div className="space-y-1.5 animate-fadeIn">
              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                Saat sync, sistem akan otomatis di background:
                <br />• <strong className="text-[#D4AF37]/80">Filter file &lt; 100KB</strong> — skip thumbnail/low quality
                <br />• <strong className="text-[#D4AF37]/80">AI Quality Scoring</strong> — AI menilai kualitas tiap foto, foto jelek (score &lt;5) disembunyikan otomatis
              </p>
            </div>
          )}
        </div>

        {/* Auto Sync Settings Section */}
        <div className="border-t border-[#D4AF37]/15 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest">
              Sinkron Otomatis
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors"></div>
              <span className="ml-2.5 text-[10px] font-mono font-bold text-[#D4AF37]">
                {autoSyncEnabled ? "AKTIF" : "NONAKTIF"}
              </span>
            </label>
          </div>

          {autoSyncEnabled && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Interval Waktu:
              </label>
              <select
                value={autoSyncInterval}
                onChange={(e) =>
                  setAutoSyncInterval(e.target.value as any)
                }
                className="w-full bg-[#1F0F3D]/90 border border-violet-950 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all font-mono font-semibold"
              >
                <option className="bg-[#120A21]" value="30s">
                  ⚡ Realtime (30 Detik)
                </option>
                <option className="bg-[#120A21]" value="1m">
                  Setiap 1 Menit
                </option>
                <option className="bg-[#120A21]" value="3m">
                  Setiap 3 Menit
                </option>
                <option className="bg-[#120A21]" value="5m">
                  Setiap 5 Menit
                </option>
                <option className="bg-[#120A21]" value="1h">
                  Setiap 1 Jam
                </option>
                <option className="bg-[#120A21]" value="6h">
                  Setiap 6 Jam
                </option>
              </select>
              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                *Tautan sinkronisasi berjalan otomatis di background ketika
                browser Admin/Manajer terhubung.{" "}
                <span className="text-[#D4AF37]/80">
                  Pilih <strong>Realtime</strong> agar foto baru/perubahan
                  di Google Drive langsung tersinkron tiap 30 detik.
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="flex space-x-2 pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-xs tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
          >
            {isLoading
              ? "Memproses..."
              : editingId
              ? "Terapkan Perubahan"
              : "Deploy Gallery"}
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
  );

  return (
    <div id="admin-panel-container" className="space-y-6">
      {/* Tab bar (only if admin) */}
      {userRole === "admin" && (
        <div
          id="admin-tab-bar"
          className="flex border-b border-[#D4AF37]/15 pb-2 ml-1 mb-2 space-x-6"
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("projects");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`pb-2 px-1 text-xs uppercase tracking-wider font-extrabold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "projects"
                ? "text-[#D4AF37] border-[#D4AF37]"
                : "text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <FolderKanban className="w-4 h-4 text-[#D4AF37]" />
            <span>Kelola Galeri Kegiatan</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("accounts");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`pb-2 px-1 text-xs uppercase tracking-wider font-extrabold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "accounts"
                ? "text-[#D4AF37] border-[#D4AF37]"
                : "text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <Users className="w-4 h-4 text-violet-400" />
            <span>
              Manajemen Akun ({accounts.length ? accounts.length : "..."})
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("settings");
              setErrorMsg("");
              setSuccessMsg("");
              setSaTestResult(null);
            }}
            className={`pb-2 px-1 text-xs uppercase tracking-wider font-extrabold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "settings"
                ? "text-[#D4AF37] border-[#D4AF37]"
                : "text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span>Pengaturan</span>
          </button>
        </div>
      )}

      {/* Conditional Tabs render */}
      {activeTab === "projects" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section — only shown inline for "create new" mode.
              Edit mode uses a modal popup (below) so admin doesn't need to scroll up. */}
          {!isEditing && renderGalleryForm()}

          {/* Grid of Projects — full width when editing (form is in modal) */}
          <div className={isEditing ? "lg:col-span-3" : "lg:col-span-2"}>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#D4AF37]/15">
              <div className="flex items-center space-x-2.5">
                <Library className="w-5 h-5 text-[#D4AF37]" />
                <h2 className="text-md font-serif font-bold text-white">
                  Daftar Galeri di Server
                </h2>
              </div>
              <span className="text-xs bg-[#120A21] text-slate-300 border border-[#D4AF37]/30 py-1 px-3 rounded-full font-mono">
                {projects.length} Total
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D4AF37]/30 p-12 text-center bg-[#120A21]/40">
                <FolderKanban className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-3" />
                <p className="text-sm text-slate-400">
                  Belum ada galeri yang terbuat. Buat galeri pertama Anda di panel
                  kiri!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((project) => {
                  const isSyncing = syncingId === project.id;
                  const isTogglingHide = togglingHideId === project.id;
                  const hasNoPhotos = project.photoCount === 0;

                  return (
                    <div
                      key={project.id}
                      className="bg-[#120A21] border border-violet-950/80 hover:border-[#D4AF37]/45 rounded-xl p-5 flex flex-col justify-between transition-all group hover:bg-[#1C0F32] shadow-xl"
                    >
                      <div>
                        {/* Card Head */}
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-serif text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors pr-2">
                            {project.name}
                          </h3>
                          <div className="flex items-center space-x-1 shrink-0">
                            <span
                              className={`text-[10px] px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1 border font-medium ${
                                project.displayMode === "all"
                                  ? "bg-emerald-950/45 text-emerald-400 border-emerald-900/50"
                                  : "bg-amber-950/40 text-amber-400 border-amber-900/50"
                              }`}
                            >
                              {project.displayMode === "all" ? (
                                <>
                                  <Globe className="w-2.5 h-2.5 mr-0.5 text-emerald-400" />
                                  <span>Semua</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-2.5 h-2.5 mr-0.5 text-amber-400" />
                                  <span>Cari</span>
                                </>
                              )}
                            </span>
                            {project.visibility === "private" && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-medium bg-red-950/40 text-red-400 border-red-900/50">
                                <Lock className="w-2.5 h-2.5 mr-0.5" />
                                <span>Privat</span>
                              </span>
                            )}
                            {project.isHidden && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-medium bg-slate-950/60 text-slate-400 border-slate-700/50">
                                <EyeOff className="w-2.5 h-2.5 mr-0.5" />
                                <span>Tersembunyi</span>
                              </span>
                            )}
                            {project.allowVisitorUpload && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-medium bg-[#4C2A85]/40 text-[#D4AF37] border-[#D4AF37]/40">
                                <CloudUpload className="w-2.5 h-2.5 mr-0.5" />
                                <span>Upload</span>
                              </span>
                            )}
                            {!!pendingCounts[project.id] && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-bold bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse">
                                <Inbox className="w-2.5 h-2.5 mr-0.5" />
                                <span>{pendingCounts[project.id]} Pending</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2 mb-3 h-8">
                          {project.description || "Tanpa deskripsi."}
                        </p>

                        <div className="space-y-1.5 list-none text-[11px] text-slate-300 border-t border-violet-950/60 py-3 mb-3">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Jumlah Foto:</span>
                            <span
                              className={`font-mono font-bold ${
                                hasNoPhotos
                                  ? "text-amber-400"
                                  : "text-[#D4AF37]"
                              }`}
                            >
                              {project.photoCount} foto
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Dibuat Pada:</span>
                            <span className="font-mono text-slate-300">
                              {project.createdAt}
                            </span>
                          </div>
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-slate-500">Google Drive:</span>
                            <a
                              href={project.driveFolderUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#D4AF37] hover:underline inline-flex items-center space-x-0.5"
                            >
                              <span className="truncate max-w-[80px]">
                                Buka Link
                              </span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                          <div className="flex items-center justify-between border-t border-violet-950/35 pt-1.5 mt-1.5">
                            <span className="text-slate-500 flex items-center space-x-1">
                              <RefreshCw
                                className={`w-3 h-3 ${
                                  project.autoSyncEnabled
                                    ? "animate-spin text-[#D4AF37]"
                                    : "text-slate-500"
                                }`}
                              />
                              <span>Sinkron Otomatis:</span>
                            </span>
                            <span
                              className={`font-mono font-bold text-[10px] ${
                                project.autoSyncEnabled
                                  ? "text-[#D4AF37]"
                                  : "text-slate-500"
                              }`}
                            >
                              {project.autoSyncEnabled
                                ? `Aktif (${
                                    project.autoSyncInterval === "30s"
                                      ? "Realtime 30 Detik"
                                      : project.autoSyncInterval === "1m"
                                      ? "1 Menit"
                                      : project.autoSyncInterval === "3m"
                                      ? "3 Menit"
                                      : project.autoSyncInterval === "5m"
                                      ? "5 Menit"
                                      : project.autoSyncInterval === "1h"
                                      ? "1 Jam"
                                      : "6 Jam"
                                  })`
                                : "Mati"}
                            </span>
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
                          <RefreshCw
                            className={`w-3.5 h-3.5 mr-0.5 ${
                              isSyncing ? "animate-spin text-[#D4AF37]" : ""
                            }`}
                          />
                          <span>
                            {isSyncing ? "Menyinkron..." : "Sinkron Drive"}
                          </span>
                        </button>

                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleHide(project);
                            }}
                            disabled={isSyncing || isTogglingHide}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              project.isHidden
                                ? "border-violet-950 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5"
                                : "border-violet-950 hover:border-slate-500 text-slate-400 hover:text-slate-200 hover:bg-slate-500/10"
                            }`}
                            title={
                              project.isHidden
                                ? "Tampilkan galeri di halaman publik"
                                : "Sembunyikan galeri dari halaman publik"
                            }
                          >
                            {isTogglingHide ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : project.isHidden ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                          </button>
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
                              openPendingViewer(project.id, project.name);
                            }}
                            disabled={isSyncing}
                            className={`relative p-1.5 rounded-lg border transition-all cursor-pointer ${
                              pendingCounts[project.id]
                                ? "border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                                : "border-violet-950 hover:border-amber-500/40 text-slate-400 hover:text-amber-400 hover:bg-amber-500/5"
                            } ${project.allowVisitorUpload ? "" : "opacity-40"}`}
                            title={
                              project.allowVisitorUpload
                                ? "Lihat upload pending dari pengunjung"
                                : "Upload mandiri nonaktif"
                            }
                          >
                            <Inbox className="w-3.5 h-3.5" />
                            {!!pendingCounts[project.id] && (
                              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-[#0C061A] text-[8px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1">
                                {pendingCounts[project.id]}
                              </span>
                            )}
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
                          ⚠ Belum disinkron. Klik &quot;Sinkron Drive&quot; agar
                          foto tampil!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "accounts" ? (
        /* Accounts Management Tab view */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Account Form Section */}
          <div className="lg:col-span-1 bg-[#120A21] border border-violet-900/40 rounded-2xl p-6 shadow-2xl relative backdrop-blur-sm self-start">
            <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-violet-900/30">
              <UserPlus className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-md font-serif font-bold text-white">
                Daftarkan Akun Baru
              </h2>
            </div>

            {errorMsg && (
              <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start space-x-2 p-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 rounded-lg text-xs mb-4">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
                  Alamat Email Google
                </label>
                <input
                  type="email"
                  placeholder="Contoh: manager@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-500 transition-all font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
                  Nama Lengkap / Jabatan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi (Manajer Kegiatan)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
                  Peran / Izin Hak Akses
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRole("manager")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                      newRole === "manager"
                        ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                        : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center space-x-1">
                      <Sliders className="w-3.5 h-3.5 text-violet-400" />
                      <span>Manajer</span>
                    </div>
                    <span className="text-[9px] text-slate-300 text-center font-normal">
                      Buat &amp; Share Galeri
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole("admin")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                      newRole === "admin"
                        ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                        : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center space-x-1">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Admin</span>
                    </div>
                    <span className="text-[9px] text-slate-300 text-center font-normal">
                      Semua + Kelola Akun
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] font-extrabold text-xs tracking-wider uppercase hover:bg-[#dfbb66] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
                >
                  {isLoading ? "Mengirim..." : "Daftarkan Akun"}
                </button>
              </div>
            </form>
          </div>

          {/* Registered Users List Section */}
          <div className="lg:col-span-2 bg-[#120A21]/30 border border-violet-900/20 rounded-2xl p-6 shadow-2xl backdrop-blur-sm self-start">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-violet-900/35">
              <div className="flex items-center space-x-2.5">
                <Users className="w-5 h-5 text-[#D4AF37]" />
                <h2 className="text-md font-serif font-bold text-white">
                  Daftar Akun Pengelola Aktif
                </h2>
              </div>
              <span className="text-xs bg-violet-950/50 text-[#D4AF37] border border-[#D4AF37]/40 py-1 px-3 rounded-full font-mono">
                {accounts.length} Akun
              </span>
            </div>

            {loadingAccounts ? (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-violet-400 animate-spin mb-2" />
                <span className="text-xs text-slate-400 font-mono">
                  Mengunduh daftar akun...
                </span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-400">
                  Belum ada akun pengelola yang terdaftar.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-violet-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-2">Pengguna</th>
                      <th className="py-3 px-2">Peran</th>
                      <th className="py-3 px-2">Terdaftar Sejak</th>
                      <th className="py-3 px-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-violet-950/50">
                    {accounts.map((acc) => {
                      const isOwnAccount =
                        acc.email.toLowerCase() === userEmail.toLowerCase();
                      const isPrimaryAdmin =
                        acc.email.toLowerCase() === "synclicen@gmail.com";

                      return (
                        <tr
                          key={acc.id}
                          className="hover:bg-violet-950/25 transition-colors"
                        >
                          <td className="py-3 px-2">
                            <div className="font-semibold text-white">
                              {acc.displayName || "Tanpa Nama"}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {acc.email}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                acc.role === "admin"
                                  ? "bg-amber-950/40 text-amber-400 border-amber-900/50"
                                  : "bg-violet-950/40 text-violet-300 border-violet-900/50"
                              }`}
                            >
                              {acc.role === "admin" ? "ADMIN" : "MANAJER"}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-mono text-slate-400 text-[11px]">
                            {acc.addedAt || "2026-05-28"}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {isOwnAccount ? (
                              <span className="text-[10px] text-slate-500 font-semibold px-2">
                                Akun Anda
                              </span>
                            ) : isPrimaryAdmin ? (
                              <span className="text-[10px] text-[#D4AF37]/50 font-semibold px-2">
                                Utama
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteAccount(acc.id, acc.email)
                                }
                                className="p-1.5 rounded-lg border border-violet-950 hover:border-red-600 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all cursor-pointer inline-flex items-center"
                                title="Hapus Akun"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab view — admin only */
        <div className="space-y-6">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin" />
            </div>
          ) : settingsData ? (
            <>
              {/* ── Section 1: Google Service Account ── */}
              <div className="bg-[#120A21] border border-[#D4AF37]/20 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-violet-900/30">
                  <KeyRound className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="text-md font-serif font-bold text-white">
                    Google Service Account
                  </h2>
                  {settingsData.serviceAccount.configured ? (
                    <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      AKTIF
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      BELUM DIKONFIGURASI
                    </span>
                  )}
                </div>

                {/* Current SA info */}
                {settingsData.serviceAccount.configured && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between bg-[#1F0F3D]/40 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Email Service Account
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] text-[#D4AF37] font-mono truncate max-w-[200px]">
                          {settingsData.serviceAccount.clientEmail}
                        </span>
                        <button
                          onClick={() => copyToClipboard(settingsData.serviceAccount.clientEmail || "")}
                          className="text-slate-500 hover:text-[#D4AF37] transition-colors shrink-0"
                          title="Salin email"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Sumber: <strong className="text-slate-300">{settingsData.serviceAccount.source === "db" ? "Database (via UI)" : "Env Var (via CLI)"}</strong></span>
                    </div>
                    {/* Test button + result */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleTestSa}
                        disabled={testingSa}
                        className="px-3 py-1.5 rounded-lg bg-[#4C2A85] border border-[#D4AF37]/35 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#5a329d] transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {testingSa ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3 h-3" />
                        )}
                        Tes Koneksi
                      </button>
                    </div>
                    {saTestResult && (
                      <div className={`flex items-start gap-2 p-2.5 rounded-lg text-[10px] ${
                        saTestResult.success
                          ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-300"
                          : "bg-red-500/10 border border-red-500/25 text-red-300"
                      }`}>
                        {saTestResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-relaxed">{saTestResult.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* JSON key input */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {settingsData.serviceAccount.configured
                      ? "Ganti JSON Key (opsional)"
                      : "Tempel JSON Key Service Account"}
                  </label>
                  <textarea
                    value={saJsonInput}
                    onChange={(e) => setSaJsonInput(e.target.value)}
                    placeholder={"Tempel seluruh isi file JSON key di sini..."}
                    className="w-full h-32 bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3 py-2.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] placeholder-slate-600 resize-none custom-scrollbar"
                    spellCheck={false}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveSa}
                      disabled={savingSa || !saJsonInput.trim()}
                      className="px-4 py-1.5 rounded-lg bg-[#D4AF37] text-[#4C2A85] text-[10px] font-extrabold uppercase tracking-wider hover:bg-[#dfbb66] transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {savingSa ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      Simpan
                    </button>
                    {settingsData.serviceAccount.source === "db" && (
                      <button
                        onClick={handleDeleteSa}
                        disabled={deletingSa}
                        className="px-4 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/10 transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {deletingSa ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Hapus dari DB
                      </button>
                    )}
                    <button
                      onClick={() => setShowSaInstructions(!showSaInstructions)}
                      className="ml-auto text-[10px] text-slate-400 hover:text-[#D4AF37] transition-colors"
                    >
                      {showSaInstructions ? "Sembunyikan" : "Cara setup?"}
                    </button>
                  </div>
                </div>

                {/* Setup instructions (collapsible) */}
                {showSaInstructions && (
                  <div className="mt-4 space-y-3 bg-[#1F0F3D]/30 border border-violet-950/50 rounded-xl p-4 animate-fadeIn">
                    <h4 className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider">
                      Cara Membuat Service Account
                    </h4>
                    <ol className="space-y-2 text-[10px] text-slate-400 leading-relaxed list-decimal list-inside">
                      <li>
                        Buka{" "}
                        <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline inline-flex items-center gap-0.5">
                          Google Cloud Console → Service Accounts
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </li>
                      <li>Pilih atau buat project Google Cloud baru.</li>
                      <li>Klik <strong className="text-slate-300">Create Service Account</strong>, beri nama (mis: <code className="text-[#D4AF37]">lihum-uploader</code>).</li>
                      <li>
                        Setelah dibuat, buka tab <strong className="text-slate-300">Keys</strong> → <strong className="text-slate-300">Add Key</strong> → <strong className="text-slate-300">JSON</strong>. File JSON akan terdownload otomatis.
                      </li>
                      <li>
                        Aktifkan <strong className="text-slate-300">Google Drive API</strong>:{" "}
                        <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline inline-flex items-center gap-0.5">
                          Library → Google Drive API → Enable
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </li>
                      <li>
                        <strong className="text-amber-400">Penting:</strong> Buka folder Google Drive galeri Anda → klik <strong className="text-slate-300">Share</strong> → tambahkan email Service Account (mis: <code className="text-[#D4AF37]">lihum-uploader@project.iam.gserviceaccount.com</code>) sebagai <strong className="text-slate-300">Editor</strong>.
                      </li>
                      <li>Buka file JSON yang terdownload, salin seluruh isinya, tempel ke textarea di atas, klik <strong className="text-[#D4AF37]">Simpan</strong>.</li>
                      <li>Klik <strong className="text-[#D4AF37]">Tes Koneksi</strong> untuk memastikan SA berfungsi.</li>
                    </ol>
                    <p className="text-[9px] text-slate-500 leading-relaxed border-t border-violet-950/50 pt-2">
                      Setelah SA aktif, foto yang diupload pengunjung via QR Upload akan langsung masuk ke folder Google Drive dan galeri tersinkronisasi otomatis. Tanpa SA, foto pengunjung disimpan sementara untuk ditinjau admin (lihat ikon Inbox di tab Galeri).
                    </p>
                  </div>
                )}
              </div>

              {/* ── Section 2: Database & Storage ── */}
              <div className="bg-[#120A21] border border-violet-900/40 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-violet-900/30">
                  <Database className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="text-md font-serif font-bold text-white">
                    Database & Penyimpanan
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-[#1F0F3D]/40 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {settingsData.stats.projects}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Galeri</div>
                  </div>
                  <div className="bg-[#1F0F3D]/40 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {settingsData.stats.photos}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Foto</div>
                  </div>
                  <div className="bg-[#1F0F3D]/40 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {settingsData.stats.accounts}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Akun</div>
                  </div>
                  <div className="bg-[#1F0F3D]/40 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-amber-400 font-mono">
                      {settingsData.stats.pendingUploads}
                    </div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">Pending</div>
                  </div>
                </div>
                <div className="space-y-2 text-[10px]">
                  <div className="flex items-center justify-between bg-[#1F0F3D]/30 rounded-lg px-3 py-2">
                    <span className="text-slate-500">Ukuran Upload Pending</span>
                    <span className="text-slate-300 font-mono">
                      {(settingsData.stats.pendingStorageBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[#1F0F3D]/30 rounded-lg px-3 py-2">
                    <span className="text-slate-500">Turso Database URL</span>
                    <span className="text-slate-400 font-mono text-[9px] truncate max-w-[250px]" title={settingsData.app.databaseUrl}>
                      {settingsData.app.databaseUrl}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Section 3: App Config ── */}
              <div className="bg-[#120A21] border border-violet-900/40 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-violet-900/30">
                  <Server className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="text-md font-serif font-bold text-white">
                    Konfigurasi Aplikasi
                  </h2>
                </div>
                <div className="space-y-2 text-[10px]">
                  <div className="flex items-center justify-between bg-[#1F0F3D]/30 rounded-lg px-3 py-2">
                    <span className="text-slate-500">Production URL</span>
                    <a
                      href={settingsData.app.appUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#D4AF37] hover:underline font-mono inline-flex items-center gap-1"
                    >
                      {settingsData.app.appUrl || "—"}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between bg-[#1F0F3D]/30 rounded-lg px-3 py-2">
                    <span className="text-slate-500">Environment</span>
                    <span className="text-slate-300 font-mono uppercase">{settingsData.app.nodeEnv}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 text-[9.5px] text-slate-500 bg-[#1F0F3D]/30 rounded-md px-2.5 py-2">
                  <Mail className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Pastikan domain produksi ditambahkan ke Firebase Console →
                    Authentication → Settings → Authorized domains agar login
                    Google berfungsi.
                  </span>
                </div>
              </div>

              {/* ── Section 4: Danger Zone ── */}
              <div className="bg-[#120A21] border border-red-500/20 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center space-x-2.5 mb-5 pb-3 border-b border-red-500/15">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h2 className="text-md font-serif font-bold text-white">
                    Zone Berbahaya
                  </h2>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-300 font-bold">
                      Hapus Semua Upload Pending
                    </p>
                    <p className="text-[9.5px] text-slate-500 leading-relaxed mt-0.5">
                      Menghapus {settingsData.stats.pendingUploads} foto pending dari semua galeri.
                      Tindakan ini tidak dapat dibatalkan.
                    </p>
                  </div>
                  <button
                    onClick={handleClearAllPendingGlobal}
                    disabled={clearingAllPending || settingsData.stats.pendingUploads === 0}
                    className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/10 transition-all disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                  >
                    {clearingAllPending ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Hapus Semua
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <p className="text-xs text-slate-400">Gagal memuat pengaturan.</p>
              <button
                onClick={loadSettings}
                className="mt-3 px-4 py-2 bg-[#4C2A85] text-white text-xs rounded-xl hover:bg-[#5a329d] transition-all"
              >
                Coba Lagi
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Gallery Modal — popup di tengah layar, no scroll needed */}
      {isEditing && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={resetForm}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {renderGalleryForm()}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Project Deletion */}
      {projectToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#120A21] border-2 border-red-500/40 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative space-y-5 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500 text-red-500 flex items-center justify-center mx-auto mb-2 animate-bounce">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-serif font-bold text-white">
                Yakin Hapus Galeri ini?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Anda akan menghapus galeri{" "}
                <span className="font-bold text-[#D4AF37]">
                  &quot;{projectToDelete.name}&quot;
                </span>{" "}
                secara permanen. Seluruh foto yang tersinkronasi di halaman ini
                juga akan terhapus dari metadata LIHUM server.
              </p>
              <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                Tindakan ini tidak dapat dibatalkan!
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-200 text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteProject}
                className="flex-1 py-2.5 rounded-xl bg-red-700/80 hover:bg-red-600 text-white text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer shadow-lg hover:shadow-red-500/20 active:scale-95 border border-red-500/30"
              >
                Ya, Hapus Galeri
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Uploads Viewer Modal (admin only) */}
      {pendingViewer && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
          onClick={() => setPendingViewer(null)}
        >
          <div
            className="bg-[#120A21] border-2 border-[#D4AF37]/40 rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#4C2A85] px-5 py-3.5 flex items-center justify-between border-b border-[#D4AF37]/30 z-10">
              <div className="flex items-center gap-2 min-w-0">
                <Inbox className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-serif font-bold text-white truncate">
                    Upload Pending
                  </h3>
                  <p className="text-[10px] text-slate-300 truncate">
                    {pendingViewer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingViewer(null)}
                className="text-white/70 hover:text-white text-xl leading-none px-2"
                title="Tutup"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {/* SA status banner */}
              {saConfigured === false && (
                <div className="flex items-start gap-2 text-[10px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-2">
                  <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Service Account belum dikonfigurasi. Foto di bawah diupload
                    pengunjung dan menunggu Anda unduh lalu tambahkan manual,
                    ATAU setel <code className="text-[#D4AF37]">GOOGLE_SERVICE_ACCOUNT</code> agar
                    upload otomatis ke Drive.
                  </span>
                </div>
              )}

              {loadingPending ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw className="w-5 h-5 text-[#D4AF37] animate-spin" />
                </div>
              ) : pendingList.length === 0 ? (
                <div className="text-center py-10">
                  <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">
                    Tidak ada upload pending untuk galeri ini.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {pendingList.length} foto menunggu
                    </span>
                    <button
                      onClick={clearAllPending}
                      disabled={clearingPending}
                      className="text-[10px] px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                    >
                      {clearingPending ? "Menghapus..." : "Hapus Semua"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pendingList.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between bg-[#1F0F3D]/40 border border-violet-950/60 rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-[11px] text-white font-mono truncate">
                            {u.fileName}
                          </p>
                          <p className="text-[9px] text-slate-500">
                            {u.sizeKB} KB · {new Date(u.createdAt).toLocaleString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => downloadPendingUpload(u.id)}
                            className="p-1.5 rounded-md border border-violet-950 hover:border-[#D4AF37] text-slate-400 hover:text-[#D4AF37] hover:bg-[#4C2A85]/20 transition-all"
                            title="Unduh foto"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deletePendingUpload(u.id)}
                            disabled={deletingPendingId === u.id}
                            className="p-1.5 rounded-md border border-violet-950 hover:border-red-500/50 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all disabled:opacity-50"
                            title="Hapus foto"
                          >
                            {deletingPendingId === u.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-1.5 text-[9.5px] text-slate-500 bg-[#1F0F3D]/30 rounded-md px-2.5 py-2 mt-2">
                    <Mail className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      Tip: unduh foto, lalu upload manual ke folder Google
                      Drive galeri, lalu klik &quot;Sinkron Drive&quot;. Atau setel
                      Service Account agar proses ini otomatis.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Account Access Revocation */}
      {accountToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#120A21] border-2 border-red-500/40 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative space-y-5 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500 text-red-500 flex items-center justify-center mx-auto mb-2 animate-bounce">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-serif font-bold text-white">
                Cabut Hak Akses?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Apakah Anda yakin ingin mencabut seluruh hak akses pengelolaan
                bagi email{" "}
                <span className="font-mono text-[#D4AF37]">
                  &quot;{accountToDelete.email}&quot;
                </span>
                ? Akun ini tidak akan dapat berpindah ke dashboard pengelola
                setelah ini.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-200 text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                className="flex-1 py-2.5 rounded-xl bg-red-700/80 hover:bg-red-600 text-white text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer shadow-lg hover:shadow-red-500/20 active:scale-95 border border-red-500/30"
              >
                Cabut Izin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
