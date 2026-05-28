import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// We request Google Drive read-only access to browse folders and get photo metadata
provider.addScope("https://www.googleapis.com/auth/drive.readonly");

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
export const adminSignInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error("Gagal memperoleh token akses Google Drive. Harap coba lagi.");
    }

    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
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
