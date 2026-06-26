import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ Cloudflare Pages compat: standalone output is REQUIRED for Cloudflare
  // deployment. Without it, the build produces a standard Next.js app that
  // Cloudflare's @cloudflare/next-on-pages adapter can't bundle into a worker.
  output: "standalone",
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
  ],
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
