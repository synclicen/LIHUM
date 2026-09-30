/**
 * Google Service Account authentication for Cloudflare Workers.
 *
 * Implements the JWT-based server-to-server OAuth 2.0 flow (RFC 7523) using
 * only the Web Crypto API — no external dependencies, runs natively on
 * Cloudflare Workers and Node.js.
 *
 * Flow:
 *  1. Build a JWT {header}.{payload} (base64url-encoded, no padding).
 *  2. Sign it with the service account's RSA private key (PKCS#8) using
 *     RSASSA-PKCS1-v1_5 + SHA-256.
 *  3. Exchange the signed JWT at https://oauth2.googleapis.com/token for an
 *     access_token (valid 1 hour).
 *
 * The service account JSON is read from env:
 *  - GOOGLE_SERVICE_ACCOUNT  (preferred — full JSON key, set as Worker secret)
 *  - or GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY  (for manual dashboard entry)
 *
 * The service account's email MUST be added as an Editor on the Google Drive
 * folder for uploads / sync to succeed.
 */

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string; // PEM string with BEGIN/END PRIVATE KEY markers
  privateKeyId?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

let cachedToken: CachedToken | null = null;

/** Reads & parses the service account credentials from env. Returns null if not configured. */
export function getServiceAccount(): ServiceAccount | null {
  // Preferred: full JSON key
  const json = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (json && json.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
          privateKeyId: parsed.private_key_id,
        };
      }
    } catch {
      /* fall through to individual env vars */
    }
  }

  // Fallback: individual env vars
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return { clientEmail, privateKey };
  }

  return null;
}

/** Whether a service account is configured. Used to show setup status in admin UI. */
export function isServiceAccountConfigured(): boolean {
  return getServiceAccount() !== null;
}

// ---------- Base64url helpers (no padding) ----------
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

// ---------- PEM → DER ----------
// PEM keys are wrapped in header/footer markers with newlines. We strip
// everything that isn't a valid base64 character, which removes the markers
// and whitespace in one pass.
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/[^A-Za-z0-9+/=]/g, "");
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    // Copy into a fresh ArrayBuffer so crypto.subtle.importKey gets a clean
    // backing buffer (Buffer's .buffer may be a larger pool slice).
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
}

// ---------- JWT signing ----------
async function signJwt(sa: ServiceAccount, scope: string): Promise<string> {
  const header: Record<string, string> = {
    alg: "RS256",
    typ: "JWT",
  };
  if (sa.privateKeyId) header.kid = sa.privateKeyId;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, // 1 hour
    iat: now,
  };

  const headerB64 = stringToBase64Url(JSON.stringify(header));
  const payloadB64 = stringToBase64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(sa.privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const signatureB64 = bytesToBase64Url(new Uint8Array(signature));

  return `${signingInput}.${signatureB64}`;
}

// ---------- Token exchange ----------
/**
 * Returns a valid Google OAuth access token for the service account, with the
 * given scope. Tokens are cached in-memory for 50 minutes (tokens last 1h).
 *
 * @param scope Space-delimited Google API scopes, e.g.
 *   "https://www.googleapis.com/auth/drive"
 */
export async function getServiceAccountAccessToken(scope: string): Promise<string> {
  // Return cached token if still valid (with 5 min safety margin).
  if (
    cachedToken &&
    cachedToken.scope === scope &&
    cachedToken.expiresAt > Date.now() + 5 * 60 * 1000
  ) {
    return cachedToken.accessToken;
  }

  const sa = getServiceAccount();
  if (!sa) {
    throw new Error(
      "Google Service Account is not configured. Set GOOGLE_SERVICE_ACCOUNT env var."
    );
  }

  const jwt = await signJwt(sa, scope);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Google token exchange failed (HTTP ${res.status}): ${errText.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope,
  };
  return data.access_token;
}

/** The Drive scope needed to both upload files to and list files in the shared folder. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
