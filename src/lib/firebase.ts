"use client";

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";

// Firebase configuration (mirrors the LIHUM firebase-applet-config.json)
const firebaseConfig = {
  projectId: "gen-lang-client-0914074264",
  appId: "1:375227071350:web:ef30fe113a04c90acb1857",
  apiKey: "AIzaSyAC_DfA1kfZhDn8DcHcJdl4edM3J52Gt-I",
  authDomain: "gen-lang-client-0914074264.firebaseapp.com",
  storageBucket: "gen-lang-client-0914074264.firebasestorage.app",
  messagingSenderId: "375227071350",
  measurementId: "",
};

// Initialize Firebase (safe on client only)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request full Drive access (read + write) — needed for:
//   - Reading photos during sync (Drive → LIHUM)
//   - Uploading visitor photos (LIHUM → Drive)
provider.addScope("https://www.googleapis.com/auth/drive");
// Force consent screen so we get a refresh_token (required for server-side
// background sync without admin keeping a tab open).
// The first sign-in MUST go through consent to issue a refresh_token.
provider.setCustomParameters({
  prompt: "consent",
});

// Cache token in memory
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize Auth listener
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If logged in on firebase but no in-memory token, we can sign in again or request token
        // Keep state but marked as needs token refresh
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Admin Google Auth Popup Sign In
// Returns user + accessToken. Refresh token (if issued) is stored via the
// /api/settings/drive-sync-token endpoint after sign-in completes.
export const adminSignInWithGoogle = async (): Promise<{
  user: User;
  accessToken: string;
  refreshToken?: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error("Gagal memperoleh token akses Google Drive. Harap coba lagi.");
    }

    cachedAccessToken = token;

    // Extract refresh token from the user object. Firebase exposes it via
    // user.stsTokenManager.refreshToken (internal API, but stable for years).
    // We send it to the server for storage so background sync can run 24/7
    // without requiring the admin to keep a browser tab open.
    const refreshToken = (result.user as any)?.stsTokenManager?.refreshToken as string | undefined;

    return { user: result.user, accessToken: token, refreshToken };
  } catch (error: any) {
    console.error("Firebase Sign In Error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve in-memory token
export const getAdminAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Logout
export const adminLogout = async () => {
  try {
    await signOut(auth);
    cachedAccessToken = null;
  } catch (error) {
    console.error("Logout Error:", error);
  }
};
