import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The game rules are shared with the game server as TypeScript source.
  transpilePackages: ["@salone/games"],
  partialPrefetching: true,
};

export default nextConfig;
