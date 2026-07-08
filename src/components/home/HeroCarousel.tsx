"use client";

// components/home/HeroCarousel.tsx
// ✅ "use client" — auto-rotate + active index state + Ken Burns
//
// Layout:
//   Desktop (md+): Blurred bg | info panel (left) + big poster card (right)
//   Mobile (<md):  Blurred bg | ONE big poster card with ALL text inside it
//                  (title, meta, genres, synopsis, CTAs overlaid on the poster)
//                  Side arrows sit OUTSIDE the card (left/right edges of screen)

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Play, Info, Star, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTitle, sanitizeDescription, type Anime } from "@/types/anime";

interface HeroCarouselProps {
  anime: Anime[];
  /** Called when the active slide changes — used to sync ambient bg color */
  onActiveChange?: (color: string | null) => void;
}

const SLIDE_MS = 7000;

export function HeroCarousel({ anime, onActiveChange }: HeroCarouselProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slides = anime.slice(0, 5);

  const go = useCallback(
    (dir: 1 | -1) => {
      setActive((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  const goTo = useCallback(
    (i: number) => {
      setActive(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Sync ambient color
  useEffect(() => {
    if (!onActiveChange) return;
    onActiveChange(slides[active]?.coverImage?.color ?? null);
  }, [active, slides, onActiveChange]);

  // Auto-rotate
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    timerRef.current = setTimeout(() => go(1), SLIDE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, paused, go, slides.length]);

  if (slides.length === 0) return null;

  const current = slides[active];
  const title = getTitle(current.title);
  const synopsis = sanitizeDescription(current.description);
  const banner =
    current.bannerImage ||
    current.coverImage?.extraLarge ||
    current.coverImage?.large ||
    "/placeholder-card.png";
  // ✅ Use extraLarge (~460×650) for the poster — large (~230×335) looks
  //    blurry/pixelated when displayed at 300–360px in the hero.
  const poster =
    current.coverImage?.extraLarge ||
    current.coverImage?.large ||
    "/placeholder-card.png";

  return (
    <section
      className="relative w-full h-[58vh] min-h-[420px] max-h-[560px] md:h-[78vh] md:min-h-[520px] md:max-h-[760px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      aria-roledescription="carousel"
      aria-label="Featured anime"
    >
      {/* ─── Blurred background slide ─── */}
      {/* ✅ Use mode="popLayout" + short transition to prevent flicker on
             slide change. The old slide exits while the new one enters
             simultaneously (crossfade), so there's no empty gap. */}
      <AnimatePresence mode="sync">
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <Image
            src={banner}
            alt=""
            aria-hidden
            fill
            priority={active === 0}
            sizes="100vw"
            className="object-cover scale-125 blur-xl"
          />
        </motion.div>
      </AnimatePresence>

      {/* Color tint over blurred bg */}
      <div
        className="absolute inset-0 opacity-25 mix-blend-soft-light"
        style={{
          background: `radial-gradient(circle at 30% 50%, ${current.coverImage?.color ?? "#e94560"} 0%, transparent 60%)`,
        }}
      />

      {/* Strong gradient overlays for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-xan-dark via-xan-dark/70 to-xan-dark/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-xan-dark/95 via-xan-dark/55 to-xan-dark/70" />
      <div className="absolute inset-0 bg-gradient-to-b from-xan-dark/50 via-transparent to-transparent" />

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE LAYOUT (< md)
          One big poster card centered, ALL text inside it, arrows outside.
          ✅ No nested <a> tags — the card is a <div>, NOT a <Link>.
          ✅ Uses mode="sync" (crossfade) instead of mode="wait" to prevent
             the flicker/gap that happens when the old card exits before the
             new one enters.
          ✅ Reduced section height + tighter padding to eliminate wasted
             space below the card.
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden relative h-full flex items-center justify-center px-14 pt-14 pb-12">
        <AnimatePresence mode="sync">
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden glass-strong p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
          >
            <div className="relative w-full h-full rounded-xl overflow-hidden group">
              <Image
                src={poster}
                alt={title}
                fill
                priority={active === 0}
                sizes="340px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Top gradient for badges */}
              <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/80 to-transparent" />
              {/* Strong bottom gradient for text legibility */}
              <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

              {/* Top row: Featured badge + score */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <span className="px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase glass-strong text-white">
                  #{active + 1} Trending
                </span>
                {current.averageScore != null && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold glass-strong text-white">
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                    {current.averageScore}%
                  </span>
                )}
              </div>

              {/* Bottom content block — ALL text inside the card */}
              <div className="absolute bottom-0 left-0 right-0 p-3.5 space-y-1.5">
                {/* Title — links to detail page */}
                <Link href={`/anime/${current.id}`}>
                  <h1 className="font-display font-bold text-[15px] leading-[1.15] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] line-clamp-2 hover:text-xan-crimson transition-colors">
                    {title}
                  </h1>
                </Link>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/80">
                  {current.seasonYear && (
                    <span className="flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />
                      {current.seasonYear}
                    </span>
                  )}
                  {current.episodes != null && (
                    <span className="text-white/60">{current.episodes} eps</span>
                  )}
                  {current.format && (
                    <span className="px-1.5 py-0.5 rounded glass text-[8px] font-medium tracking-wider uppercase">
                      {current.format}
                    </span>
                  )}
                </div>

                {/* Genres */}
                {current.genres && current.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {current.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="px-1.5 py-0.5 rounded-full text-[8px] font-medium text-white/80 glass"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Synopsis (short) */}
                {synopsis && (
                  <p className="text-[10px] text-white/65 line-clamp-2 leading-snug">
                    {synopsis}
                  </p>
                )}

                {/* CTAs — separate links, NOT nested inside another link */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Link href={`/watch/${current.id}?ep=1`}>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-0 hover:opacity-90 shadow-[0_4px_20px_rgba(233,69,96,0.4)] rounded-full px-3.5 h-8 text-[11px] font-semibold"
                    >
                      <Play className="h-3 w-3 fill-white mr-1" />
                      Watch
                    </Button>
                  </Link>
                  <Link href={`/anime/${current.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="glass-strong text-white border-white/15 hover:bg-white/10 rounded-full px-3.5 h-8 text-[11px] font-semibold"
                    >
                      <Info className="h-3 w-3 mr-1" />
                      Info
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT (md+)
          Cinematic split: info panel (left, ~60%) + clean poster card (right, ~40%).
          The poster card is pushed towards the RIGHT edge of the viewport with
          generous right padding — gives the text panel room to breathe and
          creates a more cinematic, off-center composition.
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex relative h-full max-w-7xl mx-auto px-6 lg:pl-10 lg:pr-20 xl:pr-28 items-center">
        <div className="w-full flex flex-row items-center gap-8 lg:gap-16 xl:gap-20">
          {/* ─── Info panel (left) ─── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 max-w-2xl space-y-5"
            >
              {/* Trending badge */}
              <div className="flex items-center gap-2.5 text-xs font-semibold tracking-[0.2em] uppercase text-xan-crimson">
                <span className="inline-block w-10 h-px bg-xan-crimson" />
                #{active + 1} Trending Now
              </div>

              {/* Title */}
              <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl xl:text-7xl leading-[0.95] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)] break-words">
                {title}
              </h1>

              {/* Meta row — clean divider-separated pills */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
                {current.averageScore != null && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold">{current.averageScore}%</span>
                  </span>
                )}
                {current.seasonYear && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
                    <Calendar className="h-3.5 w-3.5" />
                    {current.season
                      ? `${current.season.charAt(0)}${current.season.slice(1).toLowerCase()} ${current.seasonYear}`
                      : current.seasonYear}
                  </span>
                )}
                {current.episodes != null && (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
                    {current.episodes} eps
                  </span>
                )}
                {current.format && (
                  <span className="px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-[11px] font-medium tracking-wider uppercase">
                    {current.format}
                  </span>
                )}
              </div>

              {/* Genres */}
              {current.genres && current.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {current.genres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium text-white/70 border border-white/10 bg-white/5"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Synopsis */}
              {synopsis && (
                <p className="text-sm md:text-base text-white/65 line-clamp-2 max-w-xl leading-relaxed border-l-2 border-xan-crimson/50 pl-4">
                  {synopsis}
                </p>
              )}

              {/* CTAs */}
              <div className="flex items-center gap-3 pt-3">
                <Link href={`/watch/${current.id}?ep=1`}>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-0 hover:opacity-90 hover:shadow-[0_8px_40px_rgba(233,69,96,0.5)] shadow-[0_8px_30px_rgba(233,69,96,0.35)] rounded-full px-8 h-12 text-base font-semibold transition-all"
                  >
                    <Play className="h-5 w-5 fill-white mr-1.5" />
                    Watch Now
                  </Button>
                </Link>
                <Link href={`/anime/${current.id}`}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="glass-strong text-white border-white/15 hover:bg-white/10 hover:border-white/25 rounded-full px-7 h-12 text-base font-semibold transition-all"
                  >
                    <Info className="h-5 w-5 mr-1.5" />
                    More Info
                  </Button>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ─── Poster card (right) — clean, minimal ─── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`poster-${current.id}`}
              initial={{ opacity: 0, x: 40, scale: 0.93 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -25, scale: 0.96 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="flex-shrink-0 relative"
            >
              {/* Color glow behind the poster (from cover color) */}
              <div
                className="absolute -inset-6 rounded-3xl blur-2xl opacity-25 transition-colors duration-700"
                style={{ background: current.coverImage?.color ?? "#e94560" }}
                aria-hidden
              />
              {/* Poster */}
              <Link
                href={`/anime/${current.id}`}
                className="relative block w-[300px] lg:w-[340px] xl:w-[360px] aspect-[3/4] rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.7)] hover:shadow-[0_30px_80px_rgba(233,69,96,0.3)] transition-all duration-500 group ring-1 ring-white/10"
              >
                <Image
                  src={poster}
                  alt={title}
                  fill
                  priority={active === 0}
                  sizes="(max-width: 1280px) 300px, 360px"
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
                {/* Subtle top gradient for the score chip legibility */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
                {/* Bottom gradient for hover title reveal */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {/* Score chip (top-right) — the only persistent overlay */}
                {current.averageScore != null && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold glass-strong text-white shadow-lg">
                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                    {current.averageScore}%
                  </div>
                )}

                {/* Hover-only: play button + title at bottom */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-16 h-16 rounded-full bg-xan-crimson/95 flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300 backdrop-blur-sm">
                    <Play className="h-7 w-7 text-white fill-white ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-sm font-bold text-white line-clamp-2 leading-tight">
                    {title}
                  </p>
                </div>
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Side arrows (ALL screen sizes — outside the card on mobile) ─── */}
      <div className="absolute top-1/2 -translate-y-1/2 left-2 md:left-4 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(-1)}
          aria-label="Previous slide"
          className="w-10 h-10 md:w-11 md:h-11 rounded-full glass-strong text-white hover:bg-white/15"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 right-2 md:right-4 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(1)}
          aria-label="Next slide"
          className="w-10 h-10 md:w-11 md:h-11 rounded-full glass-strong text-white hover:bg-white/15"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 flex items-center gap-2 z-20">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active
                ? "w-8 bg-xan-crimson"
                : "w-2 bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
