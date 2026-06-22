"use client";

// components/landing/LandingHero.tsx
// ✅ Bug #1: import from "motion/react", NOT "framer-motion"
// ✅ Bug #5: "use client" required for hooks + motion
// ✅ Bug #10: contentEditable check in keyboard handler
// ✅ Bug #19: Cleanup event listener

import { motion } from "motion/react";
import { useRouter } from "next/navigation"; // ✅ Bug: next/navigation, not next/router
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CornerDownLeft, Play } from "lucide-react";

const fadeUp = (delay: number, y = 20, duration = 0.7) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { duration, delay, ease: [0.25, 0.4, 0.25, 1] as const },
});

export function LandingHero() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // ✅ Bug #10: Check all editable element types
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      if (e.key === "Enter") router.push("/home");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler); // ✅ Bug #19: Cleanup
  }, [router]);

  return (
    <section className="w-full min-h-screen p-2 md:p-3 bg-xan-landing-bg dark:bg-black">
      <div className="relative w-full h-[calc(100vh-16px)] md:h-[calc(100vh-24px)] rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden flex items-center justify-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a0a2e] to-[#0a0a0a] animate-gradient" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

        {/* Decorative blobs */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #e94560 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #7b2ff7 0%, transparent 70%)" }}
        />

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
          <motion.div
            {...fadeUp(0, 30)}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-xan-crimson to-xan-violet mb-6 shadow-[0_0_60px_rgba(233,69,96,0.4)]"
          >
            <Play className="h-9 w-9 text-white fill-white" />
          </motion.div>

          <motion.h1
            {...fadeUp(0.2, 30)}
            className="font-display text-7xl md:text-8xl font-extrabold text-white tracking-tight"
          >
            XAN
          </motion.h1>

          <motion.p
            {...fadeUp(0.4, 20)}
            className="mt-4 text-lg md:text-xl text-white/60 font-sans"
          >
            Stream anime without the noise.
          </motion.p>

          <motion.div {...fadeUp(0.6, 16)} className="mt-8">
            <Button
              size="lg"
              onClick={() => router.push("/home")}
              className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white px-8 py-6 text-lg rounded-full shadow-[0_0_30px_rgba(233,69,96,0.3)] hover:shadow-[0_0_50px_rgba(233,69,96,0.5)] transition-all border-0"
            >
              Start Watching
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>

          <motion.div {...fadeUp(0.8, 12)} className="mt-6">
            <Badge
              variant="secondary"
              className="bg-white/10 text-white/50 border-white/10"
            >
              Press Enter to explore
              <CornerDownLeft className="ml-1.5 h-3 w-3" />
            </Badge>
          </motion.div>

          <motion.div
            {...fadeUp(1.0, 12)}
            className="mt-10 flex items-center justify-center gap-6 text-white/40 text-xs"
          >
            <span>10k+ titles</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>HD streaming</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Free forever</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
