"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  AlertTriangle,
  CloudUpload,
  Download,
  Clock,
  Inbox,
  Camera,
  X,
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
    "projects" | "accounts" | "upload"
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

  // ── Additional Drive folders (edit mode only) ──
  const [additionalFolders, setAdditionalFolders] = useState<any[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [newFolderUrl, setNewFolderUrl] = useState("");
  const [newFolderLabel, setNewFolderLabel] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  // ── Upload Mandiri (visitor self-upload) state ──
  const [allowVisitorUpload, setAllowVisitorUpload] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [loadingPending, setLoadingPending] = useState(false);
  const [deletingPendingId, setDeletingPendingId] = useState<string | null>(null);
  const [clearingPending, setClearingPending] = useState(false);
  const [togglingUploadId, setTogglingUploadId] = useState<string | null>(null);

  // ── Camera preview state (Upload Mandiri testing tool) ──
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">(
    "environment"
  );
  const [cameraResolution, setCameraResolution] = useState<string>("1280x720");
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false);
  const [cameraPreviewError, setCameraPreviewError] = useState("");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturedTestPhoto, setCapturedTestPhoto] = useState<string | null>(
    null
  ); // data URL
  const [captureTargetGallery, setCaptureTargetGallery] = useState<string>("");
  const [savingTestPhoto, setSavingTestPhoto] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

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
    setAutoSyncInterval("3m");
    setAdditionalFolders([]);
    setNewFolderUrl("");
    setNewFolderLabel("");
    setAllowVisitorUpload(false);
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
    setAutoSyncInterval(project.autoSyncInterval || "3m");
    setAllowVisitorUpload(!!project.allowVisitorUpload);
    setErrorMsg("");
    setNewFolderUrl("");
    setNewFolderLabel("");
    loadAdditionalFolders(project.id);
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
    if (activeTab === "upload" && userRole === "admin") {
      loadPendingUploads();
    }
  }, [activeTab, userRole]);

  // Load pending counts once on mount (admin only) so project cards can show
  // their pending badge without the admin needing to visit the Upload tab.
  useEffect(() => {
    if (userRole === "admin") {
      loadPendingUploads();
    }
  }, []);

  // Default target gallery for "save test photo" dropdown — prefer the first
  // gallery with allowVisitorUpload enabled, otherwise fall back to the first
  // gallery in the list.
  useEffect(() => {
    if (!captureTargetGallery && projects.length > 0) {
      const firstEnabled = projects.find((p) => p.allowVisitorUpload);
      setCaptureTargetGallery(firstEnabled?.id || projects[0]?.id || "");
    }
  }, [projects, captureTargetGallery]);

  // ── Additional Drive folders handlers (edit mode only) ──
  const loadAdditionalFolders = async (projectId: string) => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/folders`, {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat folder tambahan.");
      const data = await res.json();
      setAdditionalFolders(data.additionalFolders || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleAddFolder = async () => {
    if (!editingId || !newFolderUrl.trim()) return;
    setAddingFolder(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${editingId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({ driveFolderUrl: newFolderUrl.trim(), label: newFolderLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambahkan folder.");
      setSuccessMsg(data.message || "Folder tambahan ditambahkan.");
      setNewFolderUrl("");
      setNewFolderLabel("");
      loadAdditionalFolders(editingId);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menambahkan folder.");
    } finally {
      setAddingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!editingId) return;
    setDeletingFolderId(folderId);
    try {
      const res = await fetch(`/api/projects/${editingId}/folders/${folderId}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus folder.");
      setSuccessMsg(data.message || "Folder dihapus.");
      loadAdditionalFolders(editingId);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus folder.");
    } finally {
      setDeletingFolderId(null);
    }
  };

  // ── Upload Mandiri (visitor self-upload) handlers ──
  const loadPendingUploads = async () => {
    if (userRole !== "admin") return;
    setLoadingPending(true);
    try {
      const res = await fetch("/api/admin/pending-uploads", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat daftar upload mandiri.");
      const data = await res.json();
      setPendingUploads(data.uploads || []);
      setPendingCounts(data.counts || {});
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Gagal memuat daftar upload mandiri dari server.");
    } finally {
      setLoadingPending(false);
    }
  };

  const handleDeletePending = async (id: string) => {
    setDeletingPendingId(id);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/admin/pending-uploads/${id}`, {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus foto pending.");
      }
      setSuccessMsg("Foto pending berhasil dihapus.");
      loadPendingUploads();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus foto pending.");
    } finally {
      setDeletingPendingId(null);
    }
  };

  const handleClearPending = async (projectId: string) => {
    setClearingPending(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(
        `/api/admin/pending-uploads?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "DELETE",
          headers: { "x-user-email": userEmail },
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menghapus semua foto pending.");
      }
      const data = await res.json();
      setSuccessMsg(
        `${data.deleted || 0} foto pending berhasil dihapus dari galeri ini.`
      );
      loadPendingUploads();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus semua foto pending.");
    } finally {
      setClearingPending(false);
    }
  };

  const handleClearAllPending = async () => {
    const galleriesWithPending = projects.filter(
      (p) => (pendingCounts[p.id] || 0) > 0
    );
    if (galleriesWithPending.length === 0) {
      setErrorMsg("Tidak ada foto pending untuk dihapus.");
      setTimeout(() => setErrorMsg(""), 2500);
      return;
    }
    setClearingPending(true);
    setErrorMsg("");
    setSuccessMsg("");
    let totalDeleted = 0;
    let failedGalleries = 0;
    try {
      for (const p of galleriesWithPending) {
        const res = await fetch(
          `/api/admin/pending-uploads?projectId=${encodeURIComponent(p.id)}`,
          {
            method: "DELETE",
            headers: { "x-user-email": userEmail },
          }
        );
        if (!res.ok) {
          failedGalleries += 1;
          continue;
        }
        const data = await res.json();
        totalDeleted += data.deleted || 0;
      }
      if (failedGalleries > 0) {
        setErrorMsg(
          `${totalDeleted} foto dihapus, ${failedGalleries} galeri gagal (coba refresh).`
        );
      } else {
        setSuccessMsg(
          `${totalDeleted} foto pending berhasil dihapus dari ${galleriesWithPending.length} galeri.`
        );
      }
      loadPendingUploads();
      setTimeout(() => {
        setSuccessMsg("");
        setErrorMsg("");
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus semua foto pending.");
    } finally {
      setClearingPending(false);
    }
  };

  const handleToggleUpload = async (projectId: string, current: boolean) => {
    setTogglingUploadId(projectId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({ allowVisitorUpload: !current }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          err.error || "Gagal mengubah pengaturan Upload Mandiri."
        );
      }
      setSuccessMsg(
        !current
          ? "Upload Mandiri diaktifkan untuk galeri ini."
          : "Upload Mandiri dinonaktifkan untuk galeri ini."
      );
      onRefresh();
      loadPendingUploads();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengubah pengaturan Upload Mandiri.");
    } finally {
      setTogglingUploadId(null);
    }
  };

  // ── Camera preview handlers (Upload Mandiri testing tool) ──
  const loadCameraDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(videoInputs);
      // Auto-select first device if none selected yet.
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
      // Note: if labels are empty, we don't yet have permission — labels will
      // populate after getUserMedia is called once.
    } catch (err) {
      console.warn("Failed to enumerate camera devices:", err);
    }
  }, [selectedDeviceId]);

  const startCameraPreview = useCallback(async () => {
    setCameraPreviewError("");
    setCameraStarting(true);
    // Stop existing stream
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    try {
      const [w, h] = cameraResolution.split("x").map(Number);
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: w },
              height: { ideal: h },
            }
          : {
              facingMode: { ideal: cameraFacing },
              width: { ideal: w },
              height: { ideal: h },
            },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play().catch(() => {});
      }
      setCameraPreviewActive(true);
      // Refresh device list now that we have permission (labels populate).
      loadCameraDevices();
    } catch (err: any) {
      let msg = "Gagal mengakses kamera.";
      if (err?.name === "NotAllowedError")
        msg =
          "Izin kamera ditolak. Aktifkan izin kamera di browser, lalu coba lagi.";
      else if (err?.name === "NotFoundError")
        msg = "Kamera tidak ditemukan di perangkat ini.";
      else if (err?.name === "NotReadableError")
        msg =
          "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
      else if (err?.name === "OverconstrainedError")
        msg =
          "Kombinasi pengaturan kamera tidak didukung perangkat ini. Coba resolusi atau kamera lain.";
      setCameraPreviewError(msg);
      setCameraPreviewActive(false);
    } finally {
      setCameraStarting(false);
    }
  }, [selectedDeviceId, cameraFacing, cameraResolution, loadCameraDevices]);

  const stopCameraPreview = useCallback(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setCameraPreviewActive(false);
  }, []);

  const handleCaptureTestPhoto = useCallback(() => {
    if (!previewVideoRef.current) return;
    const video = previewVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror if front camera
    if (cameraFacing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    // Resize to max 1600px on the long edge
    let { width, height } = canvas;
    const MAX = 1600;
    if (width > MAX || height > MAX) {
      if (width >= height) {
        height = Math.round((height * MAX) / width);
        width = MAX;
      } else {
        width = Math.round((width * MAX) / height);
        height = MAX;
      }
    }
    const resized = document.createElement("canvas");
    resized.width = width;
    resized.height = height;
    resized.getContext("2d")!.drawImage(canvas, 0, 0, width, height);
    const dataUrl = resized.toDataURL("image/jpeg", 0.82);
    setCapturedTestPhoto(dataUrl);
  }, [cameraFacing]);

  const handleSaveTestPhoto = async () => {
    if (!capturedTestPhoto || !captureTargetGallery) {
      setErrorMsg("Pilih galeri target terlebih dahulu.");
      return;
    }
    setSavingTestPhoto(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const base64Data = capturedTestPhoto.split(",")[1] || "";
      const res = await fetch(
        `/api/projects/${captureTargetGallery}/visitor-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photos: [
              {
                base64Data,
                mimeType: "image/jpeg",
                fileName: `admin-test-${Date.now()}.jpg`,
              },
            ],
          }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || "Foto tes tersimpan ke antrian pending.");
        setCapturedTestPhoto(null);
        loadPendingUploads();
        setTimeout(() => setSuccessMsg(""), 3000);
      } else {
        setErrorMsg(data.error || "Gagal menyimpan foto tes.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal terhubung ke server.");
    } finally {
      setSavingTestPhoto(false);
    }
  };

  // ── Camera preview lifecycle (Upload Mandiri testing tool) ──
  // Load device list when entering the upload tab; stop camera when leaving
  // the upload tab or when the component unmounts.
  useEffect(() => {
    if (activeTab === "upload") {
      loadCameraDevices();
    }
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [activeTab, loadCameraDevices]);

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
          autoSyncEnabled,
          autoSyncInterval,
          allowVisitorUpload,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan galeri.");
      }

      const data = await res.json();
      if (data.warning) {
        // Folder conflict — show as amber warning (project was still created/updated).
        setErrorMsg(data.warning);
        setTimeout(() => setErrorMsg(""), 8000);
      } else {
        setSuccessMsg(
          editingId ? "Galeri berhasil diperbarui!" : "Galeri baru sukses dibuat!"
        );
        setTimeout(() => setSuccessMsg(""), 4000);
      }
      resetForm();
      onRefresh();
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

        {/* Upload Mandiri Pengunjung (visitor self-upload via QR) */}
        <div className="border-t border-[#D4AF37]/15 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <CloudUpload className="w-3.5 h-3.5 text-[#D4AF37]" />
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
                Maksimal 5 foto per sesi. Foto disimpan untuk ditinjau admin
                sebelum ditambahkan ke galeri.
              </p>
              {isEditing && editingId && (
                <p className="text-[9.5px] text-[#D4AF37]/80 leading-normal font-sans flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>
                    Buka menu <strong>Upload Mandiri</strong> di tab atas untuk
                    meninjau foto yang dikirim pengunjung. QR upload tersedia di
                    tombol Share pada kartu galeri.
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Additional Drive Folders — edit mode only */}
        {isEditing && editingId && (
          <div className="border-t border-[#D4AF37]/15 pt-4 mt-2 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                Sumber Folder Tambahan
              </span>
              <span className="text-[9px] text-slate-500">
                {additionalFolders.length} folder
              </span>
            </div>
            <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
              Tambahkan folder Google Drive lain (mis. dari photographer yang share foldernya publik). Foto dari semua folder akan digabung saat sinkronisasi.
            </p>

            {/* List of existing additional folders */}
            {loadingFolders ? (
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <RefreshCw className="w-3 h-3 animate-spin" /> Memuat...
              </div>
            ) : additionalFolders.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic">Belum ada folder tambahan.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {additionalFolders.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 bg-[#1F0F3D]/40 border border-violet-950/60 rounded-lg px-2.5 py-1.5">
                    <FolderKanban className="w-3 h-3 text-[#D4AF37] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-white font-semibold truncate">
                        {f.label || "(tanpa label)"}
                      </p>
                      <p className="text-[8.5px] text-slate-500 font-mono truncate" title={f.driveFolderUrl}>
                        {f.driveFolderUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(f.id)}
                      disabled={deletingFolderId === f.id}
                      className="p-1 rounded-md border border-violet-950 hover:border-red-500/50 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all disabled:opacity-50 shrink-0"
                      title="Hapus folder"
                    >
                      {deletingFolderId === f.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new folder form */}
            <div className="space-y-2 bg-[#1F0F3D]/30 border border-violet-950/50 rounded-lg p-2.5">
              <input
                type="text"
                placeholder="Link Google Drive folder (https://drive.google.com/drive/folders/...)"
                value={newFolderUrl}
                onChange={(e) => setNewFolderUrl(e.target.value)}
                className="w-full bg-[#0C061A]/60 border border-violet-950 rounded-lg px-2.5 py-1.5 text-[10px] text-white font-mono focus:outline-none focus:border-[#D4AF37] placeholder-slate-600"
              />
              <input
                type="text"
                placeholder="Label (opsional, mis: Foto dari Andi)"
                value={newFolderLabel}
                onChange={(e) => setNewFolderLabel(e.target.value)}
                className="w-full bg-[#0C061A]/60 border border-violet-950 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#D4AF37] placeholder-slate-600"
              />
              <button
                type="button"
                onClick={handleAddFolder}
                disabled={addingFolder || !newFolderUrl.trim()}
                className="w-full py-1.5 rounded-lg bg-[#4C2A85] border border-[#D4AF37]/35 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#5a329d] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {addingFolder ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Tambah Folder
              </button>
            </div>

            <p className="text-[9px] text-slate-500 leading-relaxed">
              Setelah menambah/hapus folder, klik "Sinkron Drive" untuk memperbarui foto. Foto yang sama di multiple folder hanya ditampilkan sekali.
            </p>
          </div>
        )}

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
              setActiveTab("upload");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`pb-2 px-1 text-xs uppercase tracking-wider font-extrabold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "upload"
                ? "text-[#D4AF37] border-[#D4AF37]"
                : "text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <CloudUpload className="w-4 h-4 text-amber-400" />
            <span>
              Upload Mandiri (
              {loadingPending
                ? "..."
                : pendingUploads.length
                ? pendingUploads.length
                : "0"}
              )
            </span>
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
                {(() => {
                  // Detect Drive folders that are shared by more than one
                  // project — usually a setup mistake (each galeri should
                  // have its own folder). Computed client-side from the
                  // project list we already have.
                  const folderCounts = new Map<string, number>();
                  for (const p of projects) {
                    if (p.driveFolderId) {
                      folderCounts.set(
                        p.driveFolderId,
                        (folderCounts.get(p.driveFolderId) || 0) + 1
                      );
                    }
                  }
                  return projects.map((project) => {
                  const isSyncing = syncingId === project.id;
                  const isTogglingHide = togglingHideId === project.id;
                  const hasNoPhotos = project.photoCount === 0;
                  const folderDuplicate =
                    project.driveFolderId &&
                    (folderCounts.get(project.driveFolderId) || 0) > 1;

                  return (
                    <div
                      key={project.id}
                      className={`bg-[#120A21] border rounded-xl p-5 flex flex-col justify-between transition-all group hover:bg-[#1C0F32] shadow-xl ${
                        folderDuplicate
                          ? "border-amber-500/50 hover:border-amber-400"
                          : "border-violet-950/80 hover:border-[#D4AF37]/45"
                      }`}
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
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-medium bg-[#4C2A85]/40 text-[#D4AF37] border-[#D4AF37]/30"
                                title="Upload Mandiri Pengunjung aktif"
                              >
                                <CloudUpload className="w-2.5 h-2.5 mr-0.5" />
                                <span>Upload</span>
                              </span>
                            )}
                            {(pendingCounts[project.id] || 0) > 0 && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center border font-bold bg-amber-950/50 text-amber-300 border-amber-700/40"
                                title={`${pendingCounts[project.id]} foto pending ditinjau`}
                              >
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

                      {/* Warning if Drive folder is shared with another gallery */}
                      {folderDuplicate && (
                        <div className="mt-2 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 p-1.5 rounded text-center font-semibold flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Folder Drive dipakai galeri lain!</span>
                        </div>
                      )}
                    </div>
                  );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "upload" ? (
        /* Upload Mandiri Tab view */
        <div className="space-y-6">
          {/* Status Alerts */}
          {errorMsg && (
            <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-start space-x-2 p-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 rounded-lg text-xs">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Header: total pending + clear-all */}
          <div className="flex items-center justify-between pb-3 border-b border-[#D4AF37]/15">
            <div className="flex items-center space-x-2.5">
              <CloudUpload className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-md font-serif font-bold text-white">
                Upload Mandiri Pengunjung
              </h2>
              <span className="text-xs bg-amber-950/40 text-amber-300 border border-amber-700/40 py-1 px-3 rounded-full font-mono">
                {loadingPending
                  ? "..."
                  : `${pendingUploads.length} Pending`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadPendingUploads}
                disabled={loadingPending}
                className="p-1.5 rounded-lg border border-violet-950 hover:border-[#D4AF37] text-slate-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                title="Muat ulang daftar pending"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    loadingPending ? "animate-spin" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={handleClearAllPending}
                disabled={
                  clearingPending ||
                  loadingPending ||
                  pendingUploads.length === 0
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-600/50 bg-red-950/30 hover:bg-red-700/40 text-red-300 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Hapus semua foto pending di semua galeri"
              >
                {clearingPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Hapus Semua (Semua Galeri)</span>
              </button>
            </div>
          </div>

          {/* Camera Settings & Live Preview — admin testing tool */}
          <div className="bg-[#120A21] border border-[#D4AF37]/20 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-violet-900/30">
              <Camera className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-xs font-serif font-bold text-white uppercase tracking-wider">
                Pengaturan Kamera & Preview
              </h3>
              <span className="ml-auto text-[9px] text-slate-500">
                Tes kamera untuk Upload Mandiri
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Settings */}
              <div className="space-y-3">
                {/* Device selector */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Kamera
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    disabled={cameraPreviewActive}
                    className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  >
                    {cameraDevices.length === 0 ? (
                      <option value="">Memuat daftar kamera...</option>
                    ) : (
                      cameraDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Kamera ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Facing mode toggle */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Orientasi
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraFacing("environment")}
                      disabled={cameraPreviewActive}
                      className={`py-2 rounded-xl text-[10px] font-bold border transition-all disabled:opacity-50 ${
                        cameraFacing === "environment"
                          ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                          : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950"
                      }`}
                    >
                      Belakang
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraFacing("user")}
                      disabled={cameraPreviewActive}
                      className={`py-2 rounded-xl text-[10px] font-bold border transition-all disabled:opacity-50 ${
                        cameraFacing === "user"
                          ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                          : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950"
                      }`}
                    >
                      Depan (Selfie)
                    </button>
                  </div>
                </div>

                {/* Resolution */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Resolusi
                  </label>
                  <select
                    value={cameraResolution}
                    onChange={(e) => setCameraResolution(e.target.value)}
                    disabled={cameraPreviewActive}
                    className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  >
                    <option value="1280x720">HD (1280×720)</option>
                    <option value="1920x1080">Full HD (1920×1080)</option>
                    <option value="3840x2160">4K (3840×2160)</option>
                  </select>
                </div>

                {/* Start/Stop button */}
                <button
                  type="button"
                  onClick={
                    cameraPreviewActive ? stopCameraPreview : startCameraPreview
                  }
                  disabled={cameraStarting}
                  className={`w-full py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    cameraPreviewActive
                      ? "bg-red-950/40 border border-red-700/50 text-red-300 hover:bg-red-900/50"
                      : "bg-[#D4AF37] text-[#4C2A85] hover:bg-[#dfbb66]"
                  }`}
                >
                  {cameraStarting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : cameraPreviewActive ? (
                    <X className="w-3.5 h-3.5" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {cameraStarting
                      ? "Memulai..."
                      : cameraPreviewActive
                      ? "Stop Preview"
                      : "Mulai Preview"}
                  </span>
                </button>

                {/* Permission/error */}
                {cameraPreviewError && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg text-[10px]">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{cameraPreviewError}</span>
                  </div>
                )}

                {/* Info */}
                <p className="text-[9px] text-slate-500 leading-relaxed bg-[#1F0F3D]/30 rounded-md px-2.5 py-1.5">
                  Preview ini untuk menguji kamera. Pengunjung menggunakan kamera
                  via halaman /upload (QR code upload).
                </p>
              </div>

              {/* Right: Live preview */}
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] border-2 border-[#D4AF37]/30">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{
                      transform:
                        cameraFacing === "user" && cameraPreviewActive
                          ? "scaleX(-1)"
                          : "none",
                    }}
                  />
                  {!cameraPreviewActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                      <Camera className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-[10px]">Kamera belum aktif</p>
                      <p className="text-[9px] text-slate-600">
                        Klik "Mulai Preview"
                      </p>
                    </div>
                  )}
                  {cameraPreviewActive && (
                    <div className="absolute top-2 left-2 bg-red-500/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                      <span className="w-1.5 h-1.5 bg-white rounded-full" />
                      LIVE
                    </div>
                  )}
                </div>

                {/* Capture + save */}
                {cameraPreviewActive && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCaptureTestPhoto}
                      className="w-full py-2 rounded-lg bg-[#4C2A85] border border-[#D4AF37]/35 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#5a329d] transition-all flex items-center justify-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Ambil Foto Tes
                    </button>
                  </div>
                )}

                {/* Captured test photo */}
                {capturedTestPhoto && (
                  <div className="space-y-2 p-2.5 bg-[#1F0F3D]/40 rounded-lg border border-violet-950/60">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Foto Tes:
                    </p>
                    <img
                      src={capturedTestPhoto}
                      alt="Test capture"
                      className="w-full rounded-lg max-h-40 object-cover"
                    />
                    <div>
                      <label className="block text-[9px] text-slate-500 mb-1">
                        Simpan ke galeri:
                      </label>
                      <select
                        value={captureTargetGallery}
                        onChange={(e) =>
                          setCaptureTargetGallery(e.target.value)
                        }
                        className="w-full bg-[#0C061A]/60 border border-violet-950 rounded-md px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#D4AF37]"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTestPhoto}
                        disabled={savingTestPhoto || !captureTargetGallery}
                        className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#4C2A85] text-[10px] font-bold uppercase tracking-wider hover:bg-[#dfbb66] transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {savingTestPhoto ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Simpan ke Pending
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapturedTestPhoto(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Per-gallery toggle overview */}
            <div className="lg:col-span-1 bg-[#120A21] border border-violet-900/40 rounded-2xl p-5 shadow-2xl backdrop-blur-sm self-start">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-violet-900/30">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="text-xs font-serif font-bold text-white uppercase tracking-wider">
                    Status per Galeri
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {projects.length} galeri
                </span>
              </div>
              {projects.length === 0 ? (
                <p className="text-[10px] text-slate-500 italic text-center py-6">
                  Belum ada galeri.
                </p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                  {projects.map((p) => {
                    const isEnabled = !!p.allowVisitorUpload;
                    const pendingCount = pendingCounts[p.id] || 0;
                    const isToggling = togglingUploadId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-lg border p-2.5 transition-all ${
                          isEnabled
                            ? "bg-[#1F0F3D]/60 border-[#D4AF37]/40"
                            : "bg-[#1F0F3D]/30 border-violet-950/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-[11px] text-white font-semibold truncate"
                              title={p.name}
                            >
                              {p.name}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono">
                              {p.photoCount} foto
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isEnabled ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 font-bold uppercase tracking-wider">
                                On
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-950/50 text-slate-500 border border-slate-800 font-bold uppercase tracking-wider">
                                Off
                              </span>
                            )}
                            {pendingCount > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-950/50 text-amber-300 border border-amber-700/40 font-bold">
                                {pendingCount} pending
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleUpload(p.id, isEnabled)}
                          disabled={isToggling}
                          className={`w-full py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                            isEnabled
                              ? "bg-slate-950/40 border border-slate-800 text-slate-300 hover:bg-slate-900/60"
                              : "bg-[#4C2A85] border border-[#D4AF37]/35 text-white hover:bg-[#5a329d]"
                          }`}
                        >
                          {isToggling ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CloudUpload className="w-3 h-3" />
                          )}
                          <span>{isEnabled ? "Nonaktifkan" : "Aktifkan"}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Pending uploads list grouped by gallery */}
            <div className="lg:col-span-2 bg-[#120A21]/30 border border-violet-900/20 rounded-2xl p-5 shadow-2xl backdrop-blur-sm self-start">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-violet-900/30">
                <div className="flex items-center space-x-2">
                  <Inbox className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="text-xs font-serif font-bold text-white uppercase tracking-wider">
                    Antrian Upload Pengunjung
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {pendingUploads.length} foto
                </span>
              </div>

              {loadingPending ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-violet-400 animate-spin mb-2" />
                  <span className="text-xs text-slate-400 font-mono">
                    Mengunduh daftar upload mandiri...
                  </span>
                </div>
              ) : pendingUploads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D4AF37]/30 p-10 text-center">
                  <Inbox className="w-10 h-10 text-[#D4AF37]/40 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    Tidak ada foto pending dari pengunjung.
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Aktifkan Upload Mandiri pada galeri dan bagikan QR upload
                    kepada pengunjung.
                  </p>
                </div>
              ) : (
                <div className="space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
                  {(() => {
                    // Group pending uploads by projectId
                    const groups = new Map<string, any[]>();
                    for (const u of pendingUploads) {
                      const arr = groups.get(u.projectId) || [];
                      arr.push(u);
                      groups.set(u.projectId, arr);
                    }
                    const projectNameById = new Map<string, string>();
                    for (const p of projects) {
                      projectNameById.set(p.id, p.name);
                    }
                    return Array.from(groups.entries()).map(
                      ([projectId, uploads]) => {
                        const galleryName =
                          projectNameById.get(projectId) ||
                          `(unknown: ${projectId})`;
                        return (
                          <div
                            key={projectId}
                            className="rounded-lg border border-violet-950/60 bg-[#1F0F3D]/30 overflow-hidden"
                          >
                            {/* Group sub-header */}
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#1F0F3D]/60 border-b border-violet-950/60">
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-[11px] text-white font-bold truncate"
                                  title={galleryName}
                                >
                                  {galleryName}
                                </p>
                                <p className="text-[9px] text-slate-500 font-mono">
                                  {uploads.length} foto ·{" "}
                                  {projectId}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleClearPending(projectId)}
                                disabled={clearingPending}
                                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-600/40 bg-red-950/30 hover:bg-red-700/40 text-red-300 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                                title="Hapus semua foto pending galeri ini"
                              >
                                {clearingPending ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                <span>Hapus Semua</span>
                              </button>
                            </div>
                            {/* List of pending photos */}
                            <div className="divide-y divide-violet-950/40">
                              {uploads.map((u) => {
                                const downloadSrc = `/api/admin/pending-uploads/${u.id}?admin=${encodeURIComponent(
                                  userEmail
                                )}`;
                                return (
                                  <div
                                    key={u.id}
                                    className="flex items-start gap-3 px-3 py-2.5 hover:bg-violet-950/20 transition-colors"
                                  >
                                    {/* Thumbnail */}
                                    <a
                                      href={downloadSrc}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 block w-16 h-16 rounded-md overflow-hidden border border-violet-950 bg-black/40 hover:border-[#D4AF37]/50 transition-all"
                                      title="Klik untuk membuka foto"
                                    >
                                      <img
                                        src={downloadSrc}
                                        alt={u.fileName}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    </a>
                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className="text-[11px] text-white font-semibold truncate"
                                        title={u.fileName}
                                      >
                                        {u.fileName}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                        <span className="text-[9px] text-slate-400 font-mono">
                                          {u.sizeKB} KB
                                        </span>
                                        {u.uploaderIp && (
                                          <span className="text-[9px] text-slate-500 font-mono">
                                            IP: {u.uploaderIp}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-slate-500 font-mono inline-flex items-center gap-0.5">
                                          <Clock className="w-2.5 h-2.5" />
                                          {u.createdAt}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <a
                                        href={downloadSrc}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded-md border border-violet-950 hover:border-[#D4AF37] text-slate-400 hover:text-[#D4AF37] hover:bg-[#4C2A85]/20 transition-all cursor-pointer"
                                        title="Download foto"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeletePending(u.id)
                                        }
                                        disabled={deletingPendingId === u.id}
                                        className="p-1.5 rounded-md border border-violet-950 hover:border-red-600/50 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all disabled:opacity-50 cursor-pointer"
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
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
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
