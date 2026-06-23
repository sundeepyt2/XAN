import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ No `output: "standalone"` — Vercel handles deployment automatically.
  // (The old `standalone` mode required manual `cp` commands in the build script
  // which broke Vercel deployments.)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
        pathname: "/file/anilistcdn/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
    ],
  },
  // Don't ignore build errors — we want type safety.
  // But we DO want to skip type-checking files outside src/ (skills/, scripts/, etc.)
  // That's handled by tsconfig.json's `exclude` array.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
