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
    // ✅ CRITICAL — bypass Vercel's Image Optimization to stay under the
    // Hobby-tier "Image Optimization - Transformation" quota (5k/month).
    // The app renders thousands of unique AniList cover images (every anime
    // card is a distinct URL). Each unique (src × width × dpr) variant counts
    // as one transformation, so a single browse session can blow through the
    // entire monthly quota. AniList's CDN already serves reasonably-sized
    // JPEG/WebP, so we lose almost nothing by skipping Vercel's re-encode.
    // Side-effect: <Image> still lazy-loads and respects `sizes`, it just
    // serves the original URL directly (no /_next/image?url=... hop).
    unoptimized: true,
  },
  // Don't ignore build errors — we want type safety.
  // But we DO want to skip type-checking files outside src/ (skills/, scripts/, etc.)
  // That's handled by tsconfig.json's `exclude` array.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // ✅ Allow the space-z.ai preview proxy to access /_next/* resources.
  allowedDevOrigins: [
    "https://preview-chat-5618a28f-85d9-4fd1-9aa3-ab519e6c4c69.space-z.ai",
    "http://preview-chat-5618a28f-85d9-4fd1-9aa3-ab519e6c4c69.space-z.ai",
    "https://preview-5618a28f-85d9-4fd1-9aa3-ab519e6c4c69.space-z.ai",
    "http://preview-5618a28f-85d9-4fd1-9aa3-ab519e6c4c69.space-z.ai",
    "https://preview-chat-4bf7ad22-9b6e-4fee-a9cc-f3bd519a8eef.space-z.ai",
    "http://preview-chat-4bf7ad22-9b6e-4fee-a9cc-f3bd519a8eef.space-z.ai",
    "https://preview-4bf7ad22-9b6e-4fee-a9cc-f3bd519a8eef.space-z.ai",
    "http://preview-4bf7ad22-9b6e-4fee-a9cc-f3bd519a8eef.space-z.ai",
    "https://preview-chat-1503b6de-edb3-4a77-a46e-f7244dfab875.space-z.ai",
    "http://preview-chat-1503b6de-edb3-4a77-a46e-f7244dfab875.space-z.ai",
    "https://preview-1503b6de-edb3-4a77-a46e-f7244dfab875.space-z.ai",
    "http://preview-1503b6de-edb3-4a77-a46e-f7244dfab875.space-z.ai",
  ],
};

export default nextConfig;
