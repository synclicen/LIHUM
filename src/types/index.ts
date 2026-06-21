export interface Photo {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  driveFolderUrl: string;
  driveFolderId: string;
  displayMode: "all" | "search";
  visibility: "public" | "private";
  isHidden?: boolean;
  photos: Photo[];
  photoCount: number;
  createdAt: string;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: "1m" | "3m" | "5m" | "1h" | "6h";
  lastSyncedAt?: string;
  /** Present only when the gallery is private and the visitor hasn't unlocked it. */
  requiresPassword?: boolean;
  /** Present when a password was submitted but incorrect. */
  passwordError?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  driveFolderUrl: string;
  driveFolderId: string;
  displayMode: "all" | "search";
  visibility: "public" | "private";
  isHidden?: boolean;
  photoCount: number;
  createdAt: string;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: "1m" | "3m" | "5m" | "1h" | "6h";
  lastSyncedAt?: string;
}

export interface AdminUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  accessToken: string;
}

export interface Account {
  id: string;
  email: string;
  role: "admin" | "manager";
  displayName?: string;
  addedAt: string;
}
