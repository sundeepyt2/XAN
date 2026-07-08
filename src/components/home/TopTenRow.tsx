"use client";

// components/home/TopTenRow.tsx
// ✅ "use client" — horizontal scroll state

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTitle, type Anime } from "@/types/anime";

interface TopTenRowProps {
  anime: Anime[];
}

/**
 * Top 10 ranked row — clean portrait cards in a horizontal scroller.
 * Order implies rank (left = #1). No big outlined numbers.
 * Capped to 10 items.
 */
export function TopTenRow({ anime }: TopTenRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = anime.slice(0, 10);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.8, 900);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-xan-crimson to-xan-violet flex items-center justify-center">
            <Flame className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display text-foreground flex items-center gap-2">
              Top 10 Today
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-xan-crimson/15 text-xan-crimson border border-xan-crimson/25">
                Ranked
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              The most-watched anime in the last 24 hours
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-4 mask-fade-r"
      >
        {items.map((item, idx) => {
          const title = getTitle(item.title);
          const image = item.coverImage?.large ?? "/placeholder-card.png";
          const color = item.coverImage?.color ?? "#e94560";

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.4,
                delay: Math.min(idx * 0.04, 0.4),
                ease: [0.25, 0.4, 0.25, 1],
              }}
              className="flex-shrink-0 snap-start group"
              style={{ width: "clamp(120px, 32vw, 170px)" }}
            >
              <Link
                href={`/anime/${item.id}`}
                className="relative block w-full rounded-xl overflow-hidden bg-xan-card border border-xan-border transition-all duration-300 group-hover:border-xan-crimson/60 group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.55)] group-hover:-translate-y-1"
                style={{ aspectRatio: "2 / 3" }}
              >
                <Image
                  src={image}
                  alt={title}
                  fill
                  sizes="(max-width: 640px) 120px, 170px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

                {/* Score badge */}
                {item.averageScore != null && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] font-semibold text-white">
                    <span className="text-yellow-400">★</span>
                    {item.averageScore}%
                  </div>
                )}

                {/* Title block */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <h3 className="font-medium text-xs text-white line-clamp-2 leading-tight">
                    {title}
                  </h3>
                  {item.seasonYear && (
                    <p className="text-[10px] text-white/60 mt-0.5">
                      {item.seasonYear}
                    </p>
                  )}
                </div>

                {/* Color accent bottom line */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: color }}
                />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
