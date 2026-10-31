import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The game rules are shared with the game server as TypeScript source.
  transpilePackages: ["@salone/games"],
  // Party play in development: phones open the dev server at this computer's address on the local network, which
  // Next.js blocks unless allowed. These are the private network ranges; this setting has no effect in production.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  partialPrefetching: true,
};

export default nextConfig;
