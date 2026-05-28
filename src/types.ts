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
  photos: Photo[];
  photoCount: number;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  driveFolderUrl: string;
  driveFolderId: string;
  displayMode: "all" | "search";
  photoCount: number;
  createdAt: string;
}

export interface AdminUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  accessToken: string;
}
