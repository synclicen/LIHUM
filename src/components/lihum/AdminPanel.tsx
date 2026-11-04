"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ProjectSummary } from "@/types";
import { adminSignInWithGoogle } from "@/lib/firebase";
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
  Camera,
  X,
  Bell,
  BellRing,
  Settings as SettingsIcon,
  Wrench,
  Cloud,
  CheckCircle2,
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

// ── Cinematic filters (same as /upload page) ──
// Applied to live preview via CSS filter so admin sees the effect real-time.
interface CameraFilter {
  id: string;
  css: string;
}
const CAMERA_FILTERS: CameraFilter[] = [
  { id: "original", css: "none" },
  { id: "purple-haze", css: "hue-rotate(270deg) saturate(1.4) contrast(1.15) brightness(1.05)" },
  { id: "vintage", css: "sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.3)" },
  { id: "noir", css: "grayscale(1) contrast(1.4) brightness(1.05)" },
  { id: "cool-blue", css: "hue-rotate(180deg) saturate(1.2) contrast(1.1) brightness(0.95)" },
  { id: "warm-sunset", css: "sepia(0.3) saturate(1.6) hue-rotate(-10deg) brightness(1.1)" },
  { id: "cinematic", css: "contrast(1.15) saturate(1.1)" },
  { id: "vintage-film", css: "sepia(0.4) contrast(1.1) saturate(1.3) brightness(1.05)" },
  { id: "neon-pulse", css: "hue-rotate(270deg) saturate(1.5) contrast(1.2) brightness(1.1)" },
];

function getCameraFilterCss(filterId: string): string {
  return CAMERA_FILTERS.find((f) => f.id === filterId)?.css || "none";
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
    "projects" | "accounts" | "upload" | "settings"
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
    "5m" | "15m" | "30m" | "1h" | "6h"
  >("5m");
  const [autoHideDays, setAutoHideDays] = useState(0);

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

  // ── Drive Push Notification state ──
  // Tracks whether Google Drive Push Notifications are active for this admin.
  // When active, Google calls our /api/drive-webhook whenever ANY file in the
  // admin's Drive changes, triggering a near-instant (within 60s) delta-sync.
  // null = not yet checked; {active, expiration, msRemaining, needsRenewal} = status.
  const [driveWatch, setDriveWatch] = useState<{
    active: boolean;
    expiration?: string;
    msRemaining?: number;
    needsRenewal?: boolean;
  } | null>(null);
  const [driveWatchLoading, setDriveWatchLoading] = useState(false);
  const [driveWatchError, setDriveWatchError] = useState("");

  // ── Maintenance Mode state ──
  // Loaded when the Settings tab is opened. Toggle + message textarea.
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);

  // ── Visitor Frame Overlay state ──
  // Admin uploads a PNG frame; visitor-uploaded photos get the frame
  // composited on top (client-side canvas) before upload. Makes LIHUM
  // upload mandiri output match ARAY app's framed photos.
  const [frameEnabled, setFrameEnabled] = useState(false);
  const [frameImage, setFrameImage] = useState(""); // base64 data URL
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameSaving, setFrameSaving] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);

  // ── Collage Template state (multi-slot, ARAY-style) ──
  // Admin uploads a PNG template with transparent holes (slots). System
  // auto-detects slots via alpha channel + rotation angle (ported from ARAY).
  // Visitor takes N photos → composited into 1 collage output.
  const [collageEnabled, setCollageEnabled] = useState(false);
  const [collageImage, setCollageImage] = useState(""); // base64 data URL
  const [collageFitMode, setCollageFitMode] = useState<"fit" | "fill">("fill");
  const [collageSlotCount, setCollageSlotCount] = useState(0); // detected slots
  const [collageLoading, setCollageLoading] = useState(false);
  const [collageSaving, setCollageSaving] = useState(false);
  const [collageLoaded, setCollageLoaded] = useState(false);

  // ── Drive Sync state (visitor photos → Google Drive) ──
  // Admin connects Google account → refresh token saved → Worker auto-syncs
  // visitor photos to Drive folder sumber galeri 24/7.
  const [driveSyncConnected, setDriveSyncConnected] = useState(false);
  const [driveSyncEmail, setDriveSyncEmail] = useState("");
  const [driveSyncPending, setDriveSyncPending] = useState(0);
  const [driveSyncLoading, setDriveSyncLoading] = useState(false);
  const [driveSyncSyncing, setDriveSyncSyncing] = useState(false);
  const [driveSyncLastSync, setDriveSyncLastSync] = useState("");
  const [driveSyncLoaded, setDriveSyncLoaded] = useState(false);

  // ── Upload Mandiri (visitor self-upload) state ──
  const [allowVisitorUpload, setAllowVisitorUpload] = useState(false);

  // ── Global camera config (applies to ALL galeri with allowVisitorUpload) ──
  const [cameraFilter, setCameraFilter] = useState("original");
  const [cameraAspectRatio, setCameraAspectRatio] = useState("4:3");
  const [cameraCountdown, setCameraCountdown] = useState(3);
  const [cameraMirror, setCameraMirror] = useState(true);
  const [cameraMaxPhotos, setCameraMaxPhotos] = useState(5);
  const [loadingCameraConfig, setLoadingCameraConfig] = useState(false);
  const [savingCameraConfig, setSavingCameraConfig] = useState(false);

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
    setAutoSyncInterval("5m");
    setAutoHideDays(0);
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
    setAutoSyncInterval((project.autoSyncInterval as "5m" | "15m" | "30m" | "1h" | "6h") || "5m");
    setAutoHideDays((project as any).autoHideDays ?? 0);
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
      loadCameraConfig();
    }
  }, [activeTab, userRole]);

  // ── Global camera config handlers ──
  const loadCameraConfig = async () => {
    setLoadingCameraConfig(true);
    try {
      const res = await fetch("/api/admin/camera-config", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) throw new Error("Gagal memuat pengaturan kamera.");
      const text = await res.text();
      if (!text) throw new Error("Empty response (D1 writes blocked?)");
      const data = JSON.parse(text);
      setCameraFilter(data.filter || "original");
      setCameraAspectRatio(data.aspectRatio || "4:3");
      setCameraCountdown(typeof data.countdown === "number" ? data.countdown : 3);
      setCameraMirror(data.mirror !== false);
      setCameraMaxPhotos(typeof data.maxPhotos === "number" && data.maxPhotos > 0 ? data.maxPhotos : 5);
      if (data.resolution) setCameraResolution(data.resolution);
      if (data.facing) setCameraFacing(data.facing);
    } catch {
      /* non-critical, defaults used */
    } finally {
      setLoadingCameraConfig(false);
    }
  };

  const handleSaveCameraConfig = async () => {
    setSavingCameraConfig(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/admin/camera-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-user-email": userEmail },
        body: JSON.stringify({
          filter: cameraFilter,
          aspectRatio: cameraAspectRatio,
          resolution: cameraResolution,
          countdown: cameraCountdown,
          mirror: cameraMirror,
          facing: cameraFacing,
          maxPhotos: cameraMaxPhotos,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menyimpan pengaturan kamera.");
      }
      setSuccessMsg(data.message || "Pengaturan kamera global disimpan.");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan pengaturan kamera.");
    } finally {
      setSavingCameraConfig(false);
    }
  };

  // (pending queue removed — visitor photos go directly to galeri)
  useEffect(() => {
    if (userRole === "admin") {
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
      // Parse resolution from global config, swap to portrait if aspect is 9:16
      // (same logic as visitor /upload page — ensures admin preview matches visitor view)
      const [w, h] = (cameraAspectRatio === "9:16"
        ? (cameraResolution === "3840x2160" ? "2160x3840" : cameraResolution === "1280x720" ? "720x1280" : "1080x1920")
        : cameraResolution
      ).split("x").map(Number);
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
  }, [selectedDeviceId, cameraFacing, cameraResolution, cameraAspectRatio, loadCameraDevices]);

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

  const handleCaptureTestPhoto = useCallback(async () => {
    if (!previewVideoRef.current) return;
    const video = previewVideoRef.current;
    if (!video || video.videoWidth === 0) return;

    // Use the global cameraAspectRatio for the capture dimensions
    const aspectDims: Record<string, { w: number; h: number }> = {
      "4:3": { w: 1440, h: 1080 },
      "1:1": { w: 1200, h: 1200 },
      "9:16": { w: 1080, h: 1920 },
      "16:9": { w: 1920, h: 1080 },
    };
    const dims = aspectDims[cameraAspectRatio] || aspectDims["4:3"];
    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply cinematic filter to canvas (same as live preview)
    const filterCss = getCameraFilterCss(cameraFilter);
    if (filterCss !== "none") {
      ctx.filter = filterCss;
    }
    // Mirror (from global config, not cameraFacing)
    if (cameraMirror) {
      ctx.translate(dims.w, 0);
      ctx.scale(-1, 1);
    }
    // Cover-fit crop (no stretching) — same as visitor /upload page
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvasRatio = dims.w / dims.h;
    const videoRatio = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoRatio > canvasRatio) {
      sw = vh * canvasRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / canvasRatio;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dims.w, dims.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Apply frame overlay if enabled — composites the frame PNG on top of
    // the captured photo via a second canvas. This matches what the visitor
    // /upload page does, so admin test photos look exactly like visitor output.
    if (frameEnabled && frameImage) {
      try {
        const frameImg = new Image();
        frameImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          frameImg.onload = () => resolve();
          frameImg.onerror = () => reject(new Error("frame load failed"));
          frameImg.src = frameImage;
        });
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = canvas.width;
        frameCanvas.height = canvas.height;
        const fctx = frameCanvas.getContext("2d");
        if (fctx) {
          // Draw the captured photo as base
          const photoImg = new Image();
          photoImg.src = dataUrl;
          await new Promise<void>((resolve) => { photoImg.onload = () => resolve(); });
          fctx.drawImage(photoImg, 0, 0, frameCanvas.width, frameCanvas.height);
          // Draw frame on top (cover-fit, same as visitor page)
          const photoAspect = frameCanvas.width / frameCanvas.height;
          const frameAspect = frameImg.width / frameImg.height;
          let dw: number, dh: number, dx: number, dy: number;
          if (frameAspect > photoAspect) {
            dh = frameCanvas.height;
            dw = dh * frameAspect;
            dx = (frameCanvas.width - dw) / 2;
            dy = 0;
          } else {
            dw = frameCanvas.width;
            dh = dw / frameAspect;
            dx = 0;
            dy = (frameCanvas.height - dh) / 2;
          }
          fctx.drawImage(frameImg, dx, dy, dw, dh);
          setCapturedTestPhoto(frameCanvas.toDataURL("image/jpeg", 0.92));
          return;
        }
      } catch (err) {
        console.warn("[Frame] Failed to apply frame, using unframed photo:", err);
      }
    }

    setCapturedTestPhoto(dataUrl);
  }, [cameraAspectRatio, cameraFilter, cameraMirror, frameEnabled, frameImage]);

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
        setSuccessMsg(data.message || "Foto tes tersimpan ke galeri.");
        setCapturedTestPhoto(null);
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

  // Auto-restart camera when facing/resolution/aspect changes WHILE preview active.
  // This ensures the admin preview always reflects the exact constraints a
  // visitor would get (same facing, same resolution, same aspect ratio).
  useEffect(() => {
    if (cameraPreviewActive && previewStreamRef.current) {
      const timer = setTimeout(() => {
        startCameraPreview();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [cameraFacing, cameraResolution, cameraAspectRatio]);

  // ── Drive Push Notification management ──
  //
  // These functions register/unregister Google Drive Push Notification
  // channels via /api/drive-watch. When registered, Google calls our
  // /api/drive-webhook whenever ANY file in the admin's Drive changes,
  // triggering near-instant (within 60s) delta-sync.
  //
  // Channels expire after ~23h. Auto-renewal happens via the effect below
  // whenever the admin has auto-sync galleries AND the channel is expiring
  // soon (within 2h) or not yet registered.

  const fetchDriveWatchStatus = useCallback(async () => {
    if (!accessToken || !userEmail) return;
    try {
      const res = await fetch("/api/drive-watch", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-user-email": userEmail,
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      setDriveWatch({
        active: !!data.active,
        expiration: data.expiration,
        msRemaining: data.msRemaining,
        needsRenewal: data.needsRenewal,
      });
    } catch (err) {
      console.error("[DriveWatch] Status check failed:", err);
    }
  }, [accessToken, userEmail]);

  const registerDriveWatch = useCallback(async () => {
    if (!accessToken || !userEmail) return;
    setDriveWatchLoading(true);
    setDriveWatchError("");
    try {
      const res = await fetch("/api/drive-watch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-user-email": userEmail,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setDriveWatchError(data.error || "Gagal mendaftarkan push notification.");
        return false;
      }
      await fetchDriveWatchStatus();
      setSuccessMsg("Drive Push Notification diaktifkan — perubahan di Google Drive akan otomatis tersinkron.");
      setTimeout(() => setSuccessMsg(""), 5000);
      return true;
    } catch (err: any) {
      setDriveWatchError(err.message || "Gagal mendaftarkan push notification.");
      return false;
    } finally {
      setDriveWatchLoading(false);
    }
  }, [accessToken, userEmail, fetchDriveWatchStatus]);

  const unregisterDriveWatch = useCallback(async () => {
    if (!accessToken || !userEmail) return;
    setDriveWatchLoading(true);
    try {
      await fetch("/api/drive-watch", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-user-email": userEmail,
        },
      });
      setDriveWatch({ active: false });
    } catch (err) {
      console.error("[DriveWatch] Unregister failed:", err);
    } finally {
      setDriveWatchLoading(false);
    }
  }, [accessToken, userEmail]);

  // Auto-register/renew push channel when admin has auto-sync galleries
  // AND the channel is missing or expiring soon.
  // Auto-unregister when there are NO auto-sync galleries AND channel is active.
  const autoSyncCount = projects.filter((p) => p.autoSyncEnabled).length;
  useEffect(() => {
    if (!accessToken || !userEmail) return;
    // Initial status check on mount + when autoSyncCount changes.
    fetchDriveWatchStatus();
  }, [accessToken, userEmail, autoSyncCount, fetchDriveWatchStatus]);

  // Separate effect for auto-renewal: checks every 5 minutes if channel
  // needs renewal, and auto-registers if there are auto-sync galleries
  // but no active channel.
  useEffect(() => {
    if (!accessToken || !userEmail) return;
    const interval = setInterval(async () => {
      await fetchDriveWatchStatus();
      // After refreshing status, the state will update; the auto-register
      // logic in handleSubmit and manual button handles renewal.
      // Here we just check if renewal is needed and trigger it.
      setDriveWatch((prev) => {
        if (prev?.active && prev.needsRenewal && autoSyncCount > 0) {
          // Trigger renewal in background (fire-and-forget).
          registerDriveWatch();
        }
        return prev;
      });
    }, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(interval);
  }, [accessToken, userEmail, autoSyncCount, fetchDriveWatchStatus, registerDriveWatch]);

  // ── Maintenance Mode load + save ──
  //
  // Loads the current maintenance config from /api/settings/maintenance
  // when the Settings tab is opened (lazy load, only once per session).
  // Saves via PUT (admin only).

  const loadMaintenanceConfig = useCallback(async () => {
    setMaintenanceLoading(true);
    try {
      const res = await fetch("/api/settings/maintenance");
      if (!res.ok) return;
      const data = await res.json();
      setMaintenanceEnabled(!!data.enabled);
      setMaintenanceMessage(data.message || "");
      setMaintenanceLoaded(true);
    } catch (err) {
      console.error("[Maintenance] Load failed:", err);
    } finally {
      setMaintenanceLoading(false);
    }
  }, []);

  const saveMaintenanceConfig = useCallback(async () => {
    setMaintenanceSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/settings/maintenance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          enabled: maintenanceEnabled,
          message: maintenanceMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menyimpan pengaturan maintenance.");
        return;
      }
      setSuccessMsg(
        maintenanceEnabled
          ? "Mode Maintenance AKTIF — pengunjung non-admin akan melihat layar maintenance."
          : "Mode Maintenance DIMATIKAN — pengunjung dapat mengakses aplikasi normal."
      );
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan pengaturan maintenance.");
    } finally {
      setMaintenanceSaving(false);
    }
  }, [maintenanceEnabled, maintenanceMessage, userEmail]);

  // Load maintenance config when Settings tab is opened (lazy, once).
  useEffect(() => {
    if (activeTab === "settings" && !maintenanceLoaded) {
      loadMaintenanceConfig();
    }
  }, [activeTab, maintenanceLoaded, loadMaintenanceConfig]);

  // ── Visitor Frame Overlay load + save ──
  const loadFrameConfig = useCallback(async () => {
    setFrameLoading(true);
    try {
      const res = await fetch("/api/settings/visitor-frame");
      if (!res.ok) return;
      const data = await res.json();
      setFrameEnabled(!!data.enabled);
      setFrameImage(data.frameImage || "");
      setFrameLoaded(true);
    } catch (err) {
      console.error("[Frame] Load failed:", err);
    } finally {
      setFrameLoading(false);
    }
  }, []);

  const saveFrameConfig = useCallback(async () => {
    setFrameSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/settings/visitor-frame", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          enabled: frameEnabled,
          frameImage: frameImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menyimpan frame.");
        return;
      }
      setSuccessMsg(
        frameEnabled
          ? "Frame AKTIF — foto upload pengunjung akan otomatis dapat frame."
          : "Frame DIMATIKAN — foto upload pengunjung tanpa frame."
      );
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan frame.");
    } finally {
      setFrameSaving(false);
    }
  }, [frameEnabled, frameImage, userEmail]);

  // Load frame config when Upload Mandiri tab is opened (lazy, once).
  useEffect(() => {
    if (activeTab === "upload" && !frameLoaded) {
      loadFrameConfig();
    }
  }, [activeTab, frameLoaded, loadFrameConfig]);

  // Handle frame file upload (PNG) — auto-resize to stay under 800KB (D1 limit).
  const handleFrameFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/png")) {
      setErrorMsg("Frame harus berupa file PNG (dengan transparansi).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("File terlalu besar (maks 5MB sebelum kompresi).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setErrorMsg("");
      // Auto-resize to stay under 800KB (D1 bound param limit ~1MB)
      let resizedDataUrl = dataUrl;
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const MAX_DIM = 2000;
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) break;
          ctx.drawImage(img, 0, 0, w, h);
          resizedDataUrl = canvas.toDataURL("image/png");
          if (resizedDataUrl.length <= 800 * 1024) break;
          w = Math.round(w * 0.8);
          h = Math.round(h * 0.8);
        }
      } catch (err) {
        console.warn("[Frame] Auto-resize failed:", err);
      }
      setFrameImage(resizedDataUrl);
    };
    reader.onerror = () => setErrorMsg("Gagal membaca file frame.");
    reader.readAsDataURL(file);
  }, []);

  // ── Collage Template load + save ──
  const loadCollageConfig = useCallback(async () => {
    setCollageLoading(true);
    try {
      const res = await fetch("/api/settings/collage-template");
      if (!res.ok) return;
      const data = await res.json();
      setCollageEnabled(!!data.enabled);
      setCollageImage(data.templateImage || "");
      setCollageFitMode(data.fitMode === "fit" ? "fit" : "fill");
      setCollageLoaded(true);
      // Detect slot count from the template PNG
      if (data.templateImage) {
        try {
          const { detectTemplateSlots } = await import("@/lib/collage-compositing");
          const slots = await detectTemplateSlots(data.templateImage);
          setCollageSlotCount(slots.length);
        } catch {
          setCollageSlotCount(0);
        }
      } else {
        setCollageSlotCount(0);
      }
    } catch (err) {
      console.error("[Collage] Load failed:", err);
    } finally {
      setCollageLoading(false);
    }
  }, []);

  const saveCollageConfig = useCallback(async () => {
    setCollageSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/settings/collage-template", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({
          enabled: collageEnabled,
          templateImage: collageImage,
          fitMode: collageFitMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menyimpan template collage.");
        return;
      }
      setSuccessMsg(
        collageEnabled
          ? `Collage Mode AKTIF — visitor akan ambil ${collageSlotCount} foto per output.`
          : "Collage Mode DIMATIKAN."
      );
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan template collage.");
    } finally {
      setCollageSaving(false);
    }
  }, [collageEnabled, collageImage, collageFitMode, collageSlotCount, userEmail]);

  // Load collage config when Upload Mandiri tab is opened (lazy, once).
  useEffect(() => {
    if (activeTab === "upload" && !collageLoaded) {
      loadCollageConfig();
    }
  }, [activeTab, collageLoaded, loadCollageConfig]);

  // Handle collage template file upload (PNG with transparent holes)
  // Auto-resizes to keep under 800KB (D1 bound parameter limit).
  const handleCollageFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/png")) {
      setErrorMsg("Template harus berupa file PNG (dengan transparansi untuk slot).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("File terlalu besar (maks 5MB sebelum kompresi).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setErrorMsg("");

      // Auto-resize PNG to stay under 800KB (D1 bound param limit ~1MB)
      // Scale down progressively until under limit. Preserve transparency.
      let resizedDataUrl = dataUrl;
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const MAX_DIM = 2000; // cap dimensions to prevent huge PNGs
        if (w > MAX_DIM || h > MAX_DIM) {
          const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        // Progressive scaling: try each dimension, check size, reduce if needed
        let attempt = 0;
        while (attempt < 5) {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) break;
          ctx.drawImage(img, 0, 0, w, h);
          resizedDataUrl = canvas.toDataURL("image/png");
          if (resizedDataUrl.length <= 800 * 1024) break; // under 800KB, good
          // Still too large — scale down 20%
          w = Math.round(w * 0.8);
          h = Math.round(h * 0.8);
          attempt++;
        }

        if (resizedDataUrl.length > 800 * 1024) {
          setErrorMsg(`Template masih terlalu besar setelah kompresi (${Math.round(resizedDataUrl.length / 1024)}KB). Gunakan PNG lebih sederhana.`);
          return;
        }
      } catch (err) {
        console.warn("[Collage] Auto-resize failed, using original:", err);
        resizedDataUrl = dataUrl;
      }

      setCollageImage(resizedDataUrl);

      // Detect slot count immediately so admin sees feedback
      try {
        const { detectTemplateSlots } = await import("@/lib/collage-compositing");
        const slots = await detectTemplateSlots(resizedDataUrl);
        setCollageSlotCount(slots.length);
        if (slots.length === 0) {
          setErrorMsg("Tidak ada slot transparan terdeteksi. Pastikan PNG memiliki area transparan (hole) untuk foto.");
        } else {
          setSuccessMsg(`Template terdeteksi: ${slots.length} slot. Klik "Simpan Collage" untuk menyimpan.`);
          setTimeout(() => setSuccessMsg(""), 4000);
        }
      } catch {
        setCollageSlotCount(0);
      }
    };
    reader.onerror = () => setErrorMsg("Gagal membaca file template.");
    reader.readAsDataURL(file);
  }, []);

  // ── Drive Sync: load status + trigger sync ──
  const loadDriveSyncStatus = useCallback(async () => {
    setDriveSyncLoading(true);
    try {
      const res = await fetch("/api/settings/drive-sync", {
        headers: { "x-user-email": userEmail },
      });
      if (!res.ok) return;
      const data = await res.json();
      setDriveSyncConnected(!!data.refreshConnected);
      setDriveSyncPending(data.pending || 0);
      setDriveSyncLastSync(data.lastSyncAt || "");
      setDriveSyncLoaded(true);
      // Also fetch connected email
      const tokenRes = await fetch("/api/settings/drive-sync-token", {
        headers: { "x-user-email": userEmail },
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setDriveSyncEmail(tokenData.userEmail || "");
      }
    } catch (err) {
      console.error("[DriveSync] Status load failed:", err);
    } finally {
      setDriveSyncLoading(false);
    }
  }, [userEmail]);

  const triggerDriveSync = useCallback(async () => {
    setDriveSyncSyncing(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      // Step 1: ALWAYS re-login to get a FRESH access token.
      // Google OAuth tokens expire after 1 hour. Without re-login, sync fails
      // with 401. This opens a Google popup; admin just clicks their account.
      let freshToken: string;
      try {
        const reLoginResult = await adminSignInWithGoogle();
        if (reLoginResult?.accessToken) {
          freshToken = reLoginResult.accessToken;
        } else {
          setErrorMsg("Gagal mendapat token Google. Coba logout + login manual.");
          return;
        }
      } catch (err: any) {
        setErrorMsg(`Login ulang gagal: ${err.message || err}. Coba logout + login manual.`);
        return;
      }

      // Step 2: Sync with the fresh token
      const res = await fetch("/api/settings/drive-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail,
        },
        body: JSON.stringify({ limit: 5, accessToken: freshToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || `Gagal sync ke Drive (HTTP ${res.status}).`);
        return;
      }
      if (data.error) {
        setErrorMsg(data.error);
        return;
      }
      if (data.failed > 0 && data.synced === 0) {
        setErrorMsg(
          `Sync gagal: ${data.failed} foto tidak terupload. ` +
          `Pastikan akun Google Anda adalah OWNER folder Drive sumber galeri, ` +
          `atau folder sudah di-share ke akun Anda sebagai Editor.`
        );
      } else if (data.failed > 0) {
        setSuccessMsg(
          `Sync selesai: ${data.synced} foto berhasil, ${data.failed} gagal, ${data.remaining} menunggu.`
        );
      } else {
        setSuccessMsg(
          `Sync selesai: ${data.synced} foto dipindah ke Drive, ${data.remaining} menunggu.`
        );
      }
      setTimeout(() => setSuccessMsg(""), 6000);
      loadDriveSyncStatus();
    } catch (err: any) {
      console.error("[DriveSync] Trigger error:", err);
      setErrorMsg(err.message || "Gagal sync ke Drive. Coba lagi atau logout+login ulang.");
    } finally {
      setDriveSyncSyncing(false);
    }
  }, [userEmail, loadDriveSyncStatus]);

  const disconnectDriveSync = useCallback(async () => {
    if (!confirm("Putuskan koneksi Google Drive? Foto visitor tidak akan sync otomatis sampai Anda login ulang.")) return;
    try {
      await fetch("/api/settings/drive-sync-token", {
        method: "DELETE",
        headers: { "x-user-email": userEmail },
      });
      setDriveSyncConnected(false);
      setDriveSyncEmail("");
      setSuccessMsg("Koneksi Google Drive diputus.");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memutus koneksi.");
    }
  }, [userEmail]);

  // Load drive sync status when Settings tab opened
  useEffect(() => {
    if (activeTab === "settings" && !driveSyncLoaded) {
      loadDriveSyncStatus();
    }
  }, [activeTab, driveSyncLoaded, loadDriveSyncStatus]);

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
          autoHideDays,
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

      // ── Drive Push Notification auto-registration ──
      // If this gallery now has auto-sync enabled AND there's no active
      // push channel, register one. This ensures near-instant sync when
      // the admin adds photos to Google Drive.
      // If auto-sync was disabled and no galleries remain, unregister.
      if (autoSyncEnabled && !driveWatch?.active) {
        registerDriveWatch();
      } else if (!autoSyncEnabled) {
        // After refresh, if no auto-sync galleries remain, the auto-renewal
        // effect won't re-register — but we keep the channel until it expires
        // (harmless, just idle). Admin can manually stop via the button.
        // We intentionally DON'T auto-unregister here to avoid race conditions
        // when editing multiple galleries.
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
                Maksimal 5 foto per sesi. Foto langsung tampil di galeri.
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
                onChange={(e) => {
                  if (e.target.checked) {
                    const syncCount = projects.filter((p) => p.autoSyncEnabled).length;
                    if (syncCount >= 5) {
                      setErrorMsg(
                        `Batas maksimal 5 galeri dengan auto-sync telah tercapai (${syncCount}/5). ` +
                        `Nonaktifkan auto-sync pada galeri lain terlebih dahulu sebelum mengaktifkan yang ini.`
                      );
                      return;
                    }
                    setSuccessMsg(`Auto-sync diaktifkan (${syncCount + 1}/5).`);
                    setTimeout(() => setSuccessMsg(""), 3000);
                  }
                  setAutoSyncEnabled(e.target.checked);
                  setErrorMsg("");
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors"></div>
              <span className="ml-2.5 text-[10px] font-mono font-bold text-[#D4AF37]">
                {autoSyncEnabled ? "AKTIF" : "NONAKTIF"}
              </span>
            </label>
          </div>

          {/* Auto-sync limit indicator */}
          {(() => {
            const syncCount = projects.filter((p) => p.autoSyncEnabled).length;
            return (
              <div className={`text-[9px] flex items-center justify-between px-2 py-1 rounded-lg ${
                syncCount >= 5
                  ? "bg-red-500/10 border border-red-500/25 text-red-300"
                  : syncCount >= 3
                  ? "bg-amber-500/10 border border-amber-500/25 text-amber-300"
                  : "bg-[#1F0F3D]/30 text-slate-500"
              }`}>
                <span>Auto-sync aktif: <strong className="font-mono">{syncCount}/5</strong> galeri</span>
                {syncCount >= 5 && <span className="font-bold">⚠ Batas tercapai</span>}
              </div>
            );
          })()}

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
                <option className="bg-[#120A21]" value="5m">
                  Setiap 5 Menit (Direkomendasikan)
                </option>
                <option className="bg-[#120A21]" value="15m">
                  Setiap 15 Menit
                </option>
                <option className="bg-[#120A21]" value="30m">
                  Setiap 30 Menit
                </option>
                <option className="bg-[#120A21]" value="1h">
                  Setiap 1 Jam
                </option>
                <option className="bg-[#120A21]" value="6h">
                  Setiap 6 Jam
                </option>
              </select>
              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                <span className="text-[#D4AF37]/80">
                  ✓ <strong>Smart Delta Sync:</strong> hanya foto baru/berubah
                  yang ditulis ke database. Jika tidak ada perubahan di Google
                  Drive, sinkronisasi menghabiskan 0 kuota D1.
                </span>
                <span className="block mt-1">
                  *Sinkronisasi berjalan otomatis ketika browser
                  Admin/Manajer terbuka dan tab aktif (visible). Foto baru di
                  Google Drive akan muncul di galeri sesuai interval.
                </span>
                <span className="block mt-1 text-amber-400/70">
                  ⚠ Batas: maksimal 5 galeri dengan auto-sync aktif.
                </span>
              </p>
            </div>
          )}

          {/* ── Drive Push Notification status ──
              Shows whether Google Drive will call our webhook when files change.
              When active, sync happens within ~60s of any Drive change (near-instant).
              Requires domain verification in Google Search Console. */}
          {autoSyncCount > 0 && (
            <div className="space-y-2 animate-fadeIn border border-[#D4AF37]/20 rounded-xl p-3 bg-[#1F0F3D]/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  {driveWatch?.active ? (
                    <BellRing className="w-3.5 h-3.5 text-[#D4AF37]" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  Push Notification
                </span>
                {driveWatch?.active ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    AKTIF
                  </span>
                ) : driveWatch ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 font-bold">
                    NONAKTIF
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500 font-mono">cek...</span>
                )}
              </div>

              {driveWatch?.active && driveWatch.msRemaining != null && (
                <div className="text-[9px] text-slate-400 font-mono">
                  Berakhir dalam:{" "}
                  <strong className={
                    driveWatch.msRemaining < 2 * 60 * 60 * 1000
                      ? "text-amber-300"
                      : "text-emerald-300"
                  }>
                    {Math.floor(driveWatch.msRemaining / (60 * 60 * 1000))}j{" "}
                    {Math.floor((driveWatch.msRemaining % (60 * 60 * 1000)) / (60 * 1000))}m
                  </strong>
                  {driveWatch.needsRenewal && (
                    <span className="ml-2 text-amber-400/80">(akan diperbarui otomatis)</span>
                  )}
                </div>
              )}

              {driveWatchError && (
                <div className="text-[9px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg p-2">
                  {driveWatchError}
                </div>
              )}

              <div className="flex gap-2">
                {!driveWatch?.active ? (
                  <button
                    type="button"
                    onClick={registerDriveWatch}
                    disabled={driveWatchLoading}
                    className="flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#D4AF37]/25 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {driveWatchLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <BellRing className="w-3 h-3" />
                    )}
                    {driveWatchLoading ? "Memproses..." : "Aktifkan Push"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={unregisterDriveWatch}
                    disabled={driveWatchLoading}
                    className="flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg bg-slate-600/20 text-slate-400 border border-slate-600/30 hover:bg-slate-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {driveWatchLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Bell className="w-3 h-3" />
                    )}
                    Nonaktifkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={fetchDriveWatchStatus}
                  className="text-[10px] font-bold py-1.5 px-2 rounded-lg bg-[#1F0F3D]/60 text-slate-400 border border-slate-700/50 hover:bg-[#1F0F3D] transition-all flex items-center justify-center"
                  title="Cek ulang status"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              <p className="text-[8.5px] text-slate-500 leading-normal">
                Push notification membuat Google Drive memanggil server kita
                saat ada file berubah — sinkronisasi terjadi dalam ~60 detik,
                tanpa polling. Membutuhkan verifikasi domain di{" "}
                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D4AF37]/70 hover:text-[#D4AF37] underline"
                >
                  Google Search Console
                </a>.
              </p>
            </div>
          )}

            {/* Auto-hide gallery after X days */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Sembunyikan Otomatis
              </label>
              <select
                value={autoHideDays}
                onChange={(e) => setAutoHideDays(parseInt(e.target.value))}
                className="w-full bg-[#1F0F3D]/90 border border-violet-950 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all font-mono font-semibold"
              >
                <option className="bg-[#120A21]" value={0}>
                  Tidak Pernah
                </option>
                <option className="bg-[#120A21]" value={7}>
                  Setelah 1 Minggu
                </option>
                <option className="bg-[#120A21]" value={14}>
                  Setelah 2 Minggu
                </option>
                <option className="bg-[#120A21]" value={30}>
                  Setelah 1 Bulan
                </option>
                <option className="bg-[#120A21]" value={90}>
                  Setelah 3 Bulan
                </option>
                <option className="bg-[#120A21]" value={180}>
                  Setelah 6 Bulan
                </option>
              </select>
              <p className="text-[9.5px] text-slate-400 leading-normal font-sans mt-1">
                Galeri otomatis disembunyikan dari publik + auto-sync dimatikan
                setelah jangka waktu ini. Admin tetap bisa lihat &amp; buka kembali.
              </p>
            </div>
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
            <span>Upload Mandiri</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("settings");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className={`pb-2 px-1 text-xs uppercase tracking-wider font-extrabold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "settings"
                ? "text-[#D4AF37] border-[#D4AF37]"
                : "text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-emerald-400" />
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
                                    project.autoSyncInterval === "5m"
                                      ? "5 Menit"
                                      : project.autoSyncInterval === "15m"
                                      ? "15 Menit"
                                      : project.autoSyncInterval === "30m"
                                      ? "30 Menit"
                                      : project.autoSyncInterval === "1h"
                                      ? "1 Jam"
                                      : "6 Jam"
                                  })`
                                : "Mati"}
                            </span>
                            {project.autoSyncEnabled && (
                              <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 font-bold">
                                {(() => {
                                  const idx = projects.filter((p) => p.autoSyncEnabled).findIndex((p) => p.id === project.id);
                                  return idx < 5 ? `#${idx + 1}` : "OVER LIMIT";
                                })()}
                              </span>
                            )}
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

          {/* Global Camera Config — applies to ALL galeri with allowVisitorUpload */}
          <div className="bg-[#120A21] border border-[#D4AF37]/30 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-violet-900/30">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-xs font-serif font-bold text-white uppercase tracking-wider">
                Pengaturan Kamera Default
              </h3>
              <span className="ml-auto text-[9px] text-slate-500">
                Berlaku untuk semua galeri
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
              Setelan default kamera yang akan dipakai pengunjung di halaman
              /upload. Perubahan filter, aspek rasio, dan mirror langsung
              tampil di live preview di bawah. Klik Simpan untuk menerapkan ke
              semua galeri.
            </p>

            {loadingCameraConfig ? (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 py-4">
                <RefreshCw className="w-3 h-3 animate-spin" /> Memuat pengaturan...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* Filter default */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Filter Default
                  </label>
                  <select
                    value={cameraFilter}
                    onChange={(e) => setCameraFilter(e.target.value)}
                    className="w-full bg-[#1F0F3D]/50 border border-violet-950 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="original">Original</option>
                    <option value="purple-haze">Purple Haze</option>
                    <option value="vintage">Vintage</option>
                    <option value="noir">Noir B&amp;W</option>
                    <option value="cool-blue">Cool Blue</option>
                    <option value="warm-sunset">Warm Sunset</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="vintage-film">Vintage Film</option>
                    <option value="neon-pulse">Neon Pulse</option>
                  </select>
                </div>

                {/* Aspect ratio default */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Aspek Rasio Default
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {(["4:3", "1:1", "9:16", "16:9"] as const).map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setCameraAspectRatio(ar)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          cameraAspectRatio === ar
                            ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                            : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                        }`}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Countdown default */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Countdown (detik)
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[0, 3, 5, 7, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCameraCountdown(n)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          cameraCountdown === n
                            ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                            : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                        }`}
                      >
                        {n === 0 ? "Off" : `${n}s`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mirror default */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Mirror Default
                  </label>
                  <button
                    type="button"
                    onClick={() => setCameraMirror(!cameraMirror)}
                    className={`w-full py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                      cameraMirror
                        ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                        : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                    }`}
                  >
                    {cameraMirror ? "ON" : "OFF"}
                  </button>
                </div>

                {/* Max photos per upload (full width) */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Maksimal Foto per Upload
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {[1, 3, 5, 7, 10, 15, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCameraMaxPhotos(n)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          cameraMaxPhotos === n
                            ? "bg-[#4C2A85] text-[#D4AF37] border-[#D4AF37]/70"
                            : "bg-[#1F0F3D]/40 text-slate-400 border-violet-950 hover:text-white"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1">
                    Batas jumlah foto yang bisa diupload pengunjung per sesi (1-20).
                  </p>
                </div>

                {/* Save button (full width) */}
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={handleSaveCameraConfig}
                    disabled={savingCameraConfig}
                    className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] text-[11px] font-extrabold uppercase tracking-wider hover:bg-[#dfbb66] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {savingCameraConfig ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    {savingCameraConfig ? "Menyimpan..." : "Simpan Pengaturan Kamera"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Visitor Frame Overlay Config ──
              Admin uploads a PNG frame (with transparency). When enabled,
              all visitor-uploaded photos get the frame composited on top
              (client-side canvas) before upload. Matches ARAY app output. */}
          <div className="bg-[#120A21] border border-[#D4AF37]/20 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-violet-900/30">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-serif font-bold text-white">
                Frame Overlay (Upload Mandiri)
              </h3>
            </div>

            {frameLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                <span className="ml-2 text-xs text-slate-400">Memuat...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Upload frame PNG (dengan transparansi) untuk diterapkan otomatis
                  pada setiap foto yang diupload pengunjung via Upload Mandiri.
                  Foto akan memiliki frame yang sama seperti aplikasi ARAY.
                </p>

                {/* Frame toggle */}
                <div className="bg-[#1F0F3D]/50 border border-violet-950/50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">Aktifkan Frame</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Foto upload pengunjung akan dapat frame otomatis
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={frameEnabled}
                      onChange={(e) => setFrameEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors" />
                  </label>
                </div>

                {/* Frame upload + preview */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    File Frame PNG
                  </label>
                  <div className="flex gap-3">
                    {/* Preview */}
                    <div className="w-20 h-20 rounded-xl bg-[#0C061A] border border-violet-950 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {frameImage ? (
                        <img
                          src={frameImage}
                          alt="Frame preview"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[8px] text-slate-600 text-center px-1">
                          Belum ada frame
                        </span>
                      )}
                    </div>
                    {/* Upload button */}
                    <div className="flex-1 flex flex-col gap-2">
                      <label className="cursor-pointer">
                        <div className="px-3 py-2 rounded-xl bg-[#1F0F3D]/80 border border-violet-950 text-[11px] font-bold text-slate-300 hover:border-[#D4AF37]/40 hover:text-white transition-all flex items-center justify-center gap-1.5">
                          <CloudUpload className="w-3.5 h-3.5" />
                          Pilih File PNG
                        </div>
                        <input
                          type="file"
                          accept="image/png"
                          onChange={handleFrameFileSelect}
                          className="hidden"
                        />
                      </label>
                      {frameImage && (
                        <button
                          type="button"
                          onClick={() => setFrameImage("")}
                          className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[10px] font-bold text-red-300 hover:bg-red-500/20 transition-all"
                        >
                          Hapus Frame
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    PNG dengan transparansi, maks 800KB (auto-resize). Frame di-scale untuk
                    menutupi seluruh foto (cover-fit).
                  </p>
                </div>

                {/* Live composite preview (if frame + captured test photo exist) */}
                {frameEnabled && frameImage && capturedTestPhoto && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      Preview Foto + Frame
                    </label>
                    <div className="w-full max-w-[200px] rounded-xl overflow-hidden border border-[#D4AF37]/20">
                      <img
                        src={capturedTestPhoto}
                        alt="Test photo with frame"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                )}

                {/* Save frame config button */}
                <button
                  type="button"
                  onClick={saveFrameConfig}
                  disabled={frameSaving}
                  className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] text-[11px] font-extrabold uppercase tracking-wider hover:bg-[#dfbb66] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {frameSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  {frameSaving ? "Menyimpan..." : "Simpan Frame"}
                </button>
              </div>
            )}
          </div>

          {/* ── Collage Template (multi-slot, ARAY-style) ──
              Admin uploads a PNG template with transparent holes. System
              auto-detects slots + rotation angle (ported from ARAY v4.7.67).
              Visitor takes N photos → composited into 1 collage output. */}
          <div className="bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-violet-900/30">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-serif font-bold text-white">
                Collage Mode (Multi-Slot)
              </h3>
            </div>

            {collageLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                <span className="ml-2 text-xs text-slate-400">Memuat...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Upload template PNG dengan <strong>area transparan (hole)</strong> sebagai
                  slot foto. Sistem otomatis mendeteksi slot + sudut rotasi
                  (mendukung slot horizontal, vertikal, miring). Visitor mengambil
                  N foto sesuai jumlah slot → otomatis di-composite menjadi 1 foto
                  dengan frame. (Ported dari ARAY v4.7.67)
                </p>

                {/* Collage toggle */}
                <div className="bg-[#1F0F3D]/50 border border-violet-950/50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">Aktifkan Collage Mode</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Visitor ambil beberapa foto → 1 output collage
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={collageEnabled}
                      onChange={(e) => setCollageEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors" />
                  </label>
                </div>

                {/* Template upload + preview */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    Template PNG (dengan transparansi)
                  </label>
                  <div className="flex gap-3">
                    {/* Preview with checkerboard background to show transparency */}
                    <div
                      className="w-24 h-24 rounded-xl border border-violet-950 overflow-hidden flex items-center justify-center shrink-0 relative"
                      style={{
                        backgroundColor: "#0C061A",
                        backgroundImage:
                          "linear-gradient(45deg, #1F0F3D 25%, transparent 25%), linear-gradient(-45deg, #1F0F3D 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1F0F3D 75%), linear-gradient(-45deg, transparent 75%, #1F0F3D 75%)",
                        backgroundSize: "16px 16px",
                        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                      }}
                    >
                      {collageImage ? (
                        <img
                          src={collageImage}
                          alt="Template preview"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[8px] text-slate-600 text-center px-1">
                          Belum ada template
                        </span>
                      )}
                    </div>
                    {/* Upload button */}
                    <div className="flex-1 flex flex-col gap-2">
                      <label className="cursor-pointer">
                        <div className="px-3 py-2 rounded-xl bg-[#1F0F3D]/80 border border-violet-950 text-[11px] font-bold text-slate-300 hover:border-[#D4AF37]/40 hover:text-white transition-all flex items-center justify-center gap-1.5">
                          <CloudUpload className="w-3.5 h-3.5" />
                          Pilih Template PNG
                        </div>
                        <input
                          type="file"
                          accept="image/png"
                          onChange={handleCollageFileSelect}
                          className="hidden"
                        />
                      </label>
                      {collageImage && (
                        <button
                          type="button"
                          onClick={() => { setCollageImage(""); setCollageSlotCount(0); }}
                          className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/25 text-[10px] font-bold text-red-300 hover:bg-red-500/20 transition-all"
                        >
                          Hapus Template
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Slot count indicator (auto-detected) */}
                  {collageImage && (
                    <div className={`text-[10px] px-3 py-2 rounded-lg border ${
                      collageSlotCount > 0
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                    }`}>
                      {collageSlotCount > 0 ? (
                        <span>
                          ✓ Terdeteksi <strong>{collageSlotCount} slot</strong> foto.
                          Visitor akan ambil {collageSlotCount} foto per output.
                        </span>
                      ) : (
                        <span>
                          ⚠ Tidak ada slot transparan terdeteksi. Pastikan PNG
                          punya area transparan (hole) untuk foto.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Fit mode selector */}
                {collageImage && collageSlotCount > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      Mode Foto (Fit/Fill)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCollageFitMode("fill")}
                        className={`py-2 px-3 rounded-xl text-[11px] font-bold border transition-all ${
                          collageFitMode === "fill"
                            ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                            : "bg-[#1F0F3D]/60 border-violet-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        Fill (Cover)
                        <span className="block text-[8px] font-normal mt-0.5 opacity-70">
                          Penuhi slot, crop jika perlu
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollageFitMode("fit")}
                        className={`py-2 px-3 rounded-xl text-[11px] font-bold border transition-all ${
                          collageFitMode === "fit"
                            ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                            : "bg-[#1F0F3D]/60 border-violet-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        Fit (Contain)
                        <span className="block text-[8px] font-normal mt-0.5 opacity-70">
                          Seluruh foto terlihat, mungkin ada border hitam
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[9px] text-slate-500 leading-relaxed">
                  PNG dengan transparansi, maks 800KB (auto-resize). Template di-render pada
                  dimensi naturalnya (tidak di-stretch). Slot dengan rotasi
                  (miring) didukung — sistem menghitung sudut via image moments.
                </p>

                {/* Save collage config button */}
                <button
                  type="button"
                  onClick={saveCollageConfig}
                  disabled={collageSaving}
                  className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-[#4C2A85] text-[11px] font-extrabold uppercase tracking-wider hover:bg-[#dfbb66] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {collageSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  {collageSaving ? "Menyimpan..." : "Simpan Collage"}
                </button>
              </div>
            )}
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
                    Orientasi <span className="text-[#D4AF37] normal-case font-mono">(global)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraFacing("environment")}
                      
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
                    Resolusi <span className="text-[#D4AF37] normal-case font-mono">(global)</span>
                  </label>
                  <select
                    value={cameraResolution}
                    onChange={(e) => setCameraResolution(e.target.value)}
                    
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

              {/* Right: Live preview — synced with global camera config above */}
              <div className="space-y-3">
                {/* Active settings indicator — shows current applied config */}
                <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                  <span className="text-slate-500 uppercase tracking-wider">Aktif:</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4C2A85]/50 text-[#D4AF37] border border-[#D4AF37]/30 font-mono font-bold">
                    {cameraFilter}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4C2A85]/50 text-[#D4AF37] border border-[#D4AF37]/30 font-mono font-bold">
                    {cameraAspectRatio}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4C2A85]/50 text-[#D4AF37] border border-[#D4AF37]/30 font-mono font-bold">
                    {cameraMirror ? "mirror" : "no-mirror"}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4C2A85]/50 text-[#D4AF37] border border-[#D4AF37]/30 font-mono font-bold">
                    max {cameraMaxPhotos} foto
                  </span>
                </div>
                <div
                  className="relative rounded-xl overflow-hidden bg-black border-2 border-[#D4AF37]/30"
                  style={{
                    aspectRatio:
                      cameraAspectRatio === "1:1"
                        ? "1 / 1"
                        : cameraAspectRatio === "9:16"
                        ? "9 / 16"
                        : cameraAspectRatio === "16:9"
                        ? "16 / 9"
                        : "4 / 3",
                  }}
                >
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{
                      transform:
                        cameraMirror && cameraPreviewActive
                          ? "scaleX(-1)"
                          : "none",
                      filter:
                        cameraPreviewActive
                          ? getCameraFilterCss(cameraFilter)
                          : "none",
                      transition: "filter 0.15s ease-out, transform 0.15s ease-out",
                    }}
                  />
                  {!cameraPreviewActive && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center text-slate-500"
                      style={{ filter: getCameraFilterCss(cameraFilter) }}
                    >
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
                        Simpan Foto Tes
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

        </div>
      ) : activeTab === "settings" ? (
        /* Settings Tab view — Maintenance Mode + future settings */
        <div className="max-w-3xl mx-auto space-y-6">
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

          {/* Maintenance Mode Card */}
          <div className="bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#D4AF37]/15">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-white">
                    Mode Maintenance
                  </h2>
                  <p className="text-xs text-slate-400">
                    Aktifkan untuk membatasi akses hanya untuk admin
                  </p>
                </div>
              </div>
              {maintenanceEnabled && (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                  AKTIF
                </span>
              )}
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Info banner */}
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-200 mb-1">
                      Tentang Mode Maintenance
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Saat diaktifkan, hanya admin/manager yang dapat mengakses
                      aplikasi. Pengunjung lain akan melihat halaman maintenance
                      dengan pesan yang Anda tulis di bawah.
                    </p>
                  </div>
                </div>
              </div>

              {maintenanceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-[#D4AF37] animate-spin" />
                  <span className="ml-2 text-sm text-slate-400">
                    Memuat pengaturan...
                  </span>
                </div>
              ) : (
                <>
                  {/* Toggle row */}
                  <div className="bg-[#1F0F3D]/50 border border-violet-950/50 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">
                        Aktifkan Maintenance
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pengunjung non-admin tidak dapat mengakses aplikasi
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={maintenanceEnabled}
                        onChange={(e) =>
                          setMaintenanceEnabled(e.target.checked)
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#1F0F3D]/85 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-100 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4AF37] after:bg-white transition-colors" />
                    </label>
                  </div>

                  {/* Message textarea */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      Pesan Maintenance{" "}
                      <span className="text-slate-500 normal-case font-normal">
                        (Opsional)
                      </span>
                    </label>
                    <textarea
                      value={maintenanceMessage}
                      onChange={(e) => setMaintenanceMessage(e.target.value)}
                      placeholder="Contoh: Sedang melakukan update sistem. Estimasi selesai pukul 14:00 WIB."
                      rows={4}
                      maxLength={4000}
                      className="w-full bg-[#1F0F3D]/60 border border-violet-950 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all resize-y min-h-[100px] font-sans"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-500">
                        Pesan ini akan ditampilkan kepada pengunjung selama
                        maintenance aktif.
                      </p>
                      <span className="text-[10px] text-slate-600 font-mono">
                        {maintenanceMessage.length}/4000
                      </span>
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={saveMaintenanceConfig}
                      disabled={maintenanceSaving}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4AF37] text-[#0C061A] font-bold text-sm hover:bg-[#E5C158] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {maintenanceSaving ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Menyimpan...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Simpan Pengaturan
                        </>
                      )}
                    </button>
                  </div>

                  {/* Live preview hint */}
                  {maintenanceEnabled && (
                    <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400">
                        Pengunjung saat ini melihat layar maintenance
                        {maintenanceMessage.trim()
                          ? " dengan pesan di atas."
                          : " tanpa pesan khusus."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Google Drive Sync (visitor photos → Drive) ──
              Admin connects Google account → refresh token saved → Worker
              auto-syncs visitor photos to Drive folder sumber galeri 24/7
              (no admin tab needed). */}
          <div className="bg-[#120A21] border border-[#D4AF37]/25 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-violet-900/30">
              <Cloud className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-serif font-bold text-white">
                Sinkronisasi Google Drive
              </h3>
              {driveSyncConnected && (
                <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  TERHUBUNG
                </span>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Hubungkan akun Google Anda agar foto yang diupload pengunjung
                otomatis dipindah ke folder Google Drive sumber galeri. Sync
                berjalan <strong>24/7 otomatis</strong> — tidak perlu tab admin
                terbuka. Storage D1 tetap kecil, foto aman di Drive.
              </p>

              {/* Connection status */}
              {driveSyncLoading ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
                  <span className="ml-2 text-xs text-slate-400">Memuat status...</span>
                </div>
              ) : driveSyncConnected ? (
                <div className="space-y-3">
                  {/* Connected info */}
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Akun Terhubung</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <p className="text-xs text-white font-mono break-all">{driveSyncEmail}</p>
                    {driveSyncLastSync && (
                      <p className="text-[10px] text-slate-500">
                        Sync terakhir: {new Date(driveSyncLastSync).toLocaleString("id-ID")}
                      </p>
                    )}
                  </div>

                  {/* Pending photos */}
                  <div className="bg-[#1F0F3D]/50 border border-violet-950/50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">
                        Foto Menunggu Sync
                      </span>
                      <span className={`text-sm font-bold ${
                        driveSyncPending > 0 ? "text-amber-300" : "text-emerald-300"
                      }`}>
                        {driveSyncPending}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2">
                      {driveSyncPending > 0
                        ? "Foto visitor di D1, belum dipindah ke Drive."
                        : "Semua foto sudah tersinkronisasi ke Drive."}
                    </p>

                    {/* Sync button */}
                    <button
                      type="button"
                      onClick={triggerDriveSync}
                      disabled={driveSyncSyncing || driveSyncPending === 0}
                      className="w-full py-2 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-[11px] font-bold hover:bg-[#D4AF37]/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {driveSyncSyncing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Menyinkronkan...
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3.5 h-3.5" />
                          Sync Sekarang
                        </>
                      )}
                    </button>
                  </div>

                  {/* Disconnect button */}
                  <button
                    type="button"
                    onClick={disconnectDriveSync}
                    disabled={driveSyncSyncing}
                    className="w-full py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-[10px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    Putuskan Koneksi
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Not connected */}
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                    <p className="text-[10px] text-amber-200 mb-1 font-bold">
                      ⚠ Belum Terhubung
                    </p>
                    <p className="text-[10px] text-slate-300 leading-relaxed">
                      Untuk mengaktifkan auto-sync, login sebagai admin via
                      "MASUK PENGELOLA" di halaman utama. Sistem akan otomatis
                      menyimpan koneksi Google Anda.
                    </p>
                  </div>

                  {/* Setup guide */}
                  <details className="bg-[#1F0F3D]/40 border border-violet-950/50 rounded-xl overflow-hidden">
                    <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-bold text-slate-300 hover:text-white transition-colors flex items-center justify-between">
                      <span>📋 Panduan Setup (sekali saja)</span>
                      <ExternalLink className="w-3 h-3" />
                    </summary>
                    <div className="px-3 pb-3 space-y-2.5 text-[10px] text-slate-400 leading-relaxed border-t border-violet-950/50">
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 1:</strong> Buka{" "}
                        <a
                          href="https://console.cloud.google.com/auth/branding"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#D4AF37] underline hover:text-[#E4C247]"
                        >
                          Google Cloud Console → Auth Platform
                        </a>
                      </div>
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 2:</strong> Pilih
                        project <code className="bg-[#0C061A] px-1.5 py-0.5 rounded text-[#D4AF37]">Default Gemini Project</code>
                        (project Firebase LIHUM)
                      </div>
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 3:</strong> Klik
                        "Branding" → isi App name: <code className="bg-[#0C061A] px-1.5 py-0.5 rounded text-[#D4AF37]">LIHUM</code>,
                        email support, home page: <code className="bg-[#0C061A] px-1.5 py-0.5 rounded text-[#D4AF37]">https://lihum.synclicen.workers.dev</code>
                      </div>
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 4:</strong> Klik
                        "Data Access" → tambah scope:{" "}
                        <code className="bg-[#0C061A] px-1.5 py-0.5 rounded text-[#D4AF37] break-all">https://www.googleapis.com/auth/drive</code>
                      </div>
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 5:</strong> Klik
                        "Audience" → "PUBLISH APP" (dari Testing → In Production)
                      </div>
                      <div>
                        <strong className="text-[#D4AF37]">Langkah 6:</strong> Login
                        sebagai admin di LIHUM (klik "MASUK PENGELOLA") → koneksi
                        otomatis tersimpan.
                      </div>
                      <p className="text-amber-300/70 pt-1 border-t border-violet-950/50">
                        ⚠ Abaikan warning "Missing domain" — Firebase Auth
                        sudah handle domain LIHUM secara otomatis.
                      </p>
                    </div>
                  </details>

                  <button
                    type="button"
                    onClick={loadDriveSyncStatus}
                    className="w-full py-2 rounded-xl bg-[#1F0F3D]/60 border border-slate-700/50 text-slate-400 text-[10px] font-bold hover:bg-[#1F0F3D] transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Cek Status Koneksi
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Placeholder for future settings */}
          <div className="text-center text-[10px] text-slate-600 pt-4">
            Pengaturan lainnya akan ditambahkan di sini
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
