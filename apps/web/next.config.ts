import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// The release this build is: the Git commit (Railway sets RAILWAY_GIT_COMMIT_SHA; elsewhere Git is asked), the same in
// every process of one build. Screens compare it with the X-App-Version the site sends now to offer a newer release
// (AppUpdates.tsx). "local" when neither is known: then no update is ever offered.
function release() {
  const fromHost = process.env.RAILWAY_GIT_COMMIT_SHA?.trim();
  if (fromHost) return fromHost.slice(0, 12);
  try { return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local"; } catch { return "local"; }
}
const RELEASE = release();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The game rules are shared with the game server as TypeScript source.
  transpilePackages: ["@salone/games"],
  // Party play in development: phones open the dev server at this computer's address on the local network, which
  // Next.js blocks unless allowed. These are the private network ranges; this setting has no effect in production.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  partialPrefetching: true,
  env: { NEXT_PUBLIC_APP_RELEASE: RELEASE },
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "X-App-Version", value: RELEASE }] },
      // The service worker must always be checked for a new version, never kept by the browser or a proxy.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default nextConfig;
