import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // TODO: Fix TS errors then remove this.
    // Pre-existing type issues from rapid prototyping; removing this breaks Vercel builds.
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
