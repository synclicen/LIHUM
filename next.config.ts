import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Opt into OpenNext-Cloudflare dev patches by setting CF_DEV=1.
// Without it, `next dev` runs as a plain Node server (used in the sandbox).
if (process.env.CF_DEV === "1") {
  try {
    initOpenNextCloudflareForDev();
  } catch {
    // opennextjs-cloudflare not available — skip silently.
  }
}

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
