"use client";

// components/home/HomeHero.tsx
// ✅ "use client" — manages active-color state shared between AmbientBackground and HeroCarousel

import { useState, useCallback } from "react";
import { AmbientBackground } from "@/components/home/AmbientBackground";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import type { Anime } from "@/types/anime";

interface HomeHeroProps {
  anime: Anime[];
}

/**
 * Wraps AmbientBackground + HeroCarousel so the ambient color reacts to
 * whichever slide the carousel is currently showing.
 */
export function HomeHero({ anime }: HomeHeroProps) {
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const handleActiveChange = useCallback((c: string | null) => {
    setActiveColor(c);
  }, []);

  return (
    <>
      <AmbientBackground color={activeColor} />
      <HeroCarousel anime={anime} onActiveChange={handleActiveChange} />
    </>
  );
}
