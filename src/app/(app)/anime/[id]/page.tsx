export const runtime = "edge";

// app/(app)/anime/[id]/page.tsx
// Server Component (async) — ✅ Bug #17: await params in Next.js 15+

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchAnimeDetail } from "@/lib/anilist";
import {
  getTitle,
  sanitizeDescription,
  type AnimeDetail,
} from "@/types/anime";
import { AnimeHero } from "@/components/anime/AnimeHero";
import { AnimeInfo } from "@/components/anime/AnimeInfo";
import { EpisodeGrid } from "@/components/anime/EpisodeGrid";
import { CharacterList } from "@/components/anime/CharacterList";
import { RelatedAnime } from "@/components/anime/RelatedAnime";
import { AllAnimeCrossReference } from "@/components/allanime/AllAnimeCrossReference";
import { ErrorCard } from "@/components/ErrorCard";

export const revalidate = 3600; // 1 hour — detail page

type Props = {
  params: Promise<{ id: string }>;
};

// ✅ generateMetadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const animeId = parseInt(id, 10);
  if (isNaN(animeId)) return { title: "Anime Not Found" };

  const result = await fetchAnimeDetail(animeId);
  if (!result?.data) return { title: "Anime Not Found" };

  const title = getTitle(result.data.title);
  const description = sanitizeDescription(result.data.description);

  return {
    title,
    description: description || `${title} on XAN`,
    openGraph: {
      title: `${title} | XAN`,
      description: description || "Stream on XAN",
      images: result.data.bannerImage
        ? [{ url: result.data.bannerImage }]
        : result.data.coverImage?.large
          ? [{ url: result.data.coverImage.large }]
          : undefined,
    },
  };
}

export default async function AnimeDetailPage({ params }: Props) {
  // ✅ Bug #17: Next.js 15 params are Promises — MUST await
  const { id } = await params;
  const animeId = parseInt(id, 10);

  if (isNaN(animeId)) {
    notFound();
  }

  const result = await fetchAnimeDetail(animeId);

  if (!result?.data) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <ErrorCard message="This anime could not be loaded" />
      </div>
    );
  }

  const anime: AnimeDetail = result.data;
  const characters = anime.characters?.edges ?? [];
  const relations = anime.relations?.edges ?? [];
  const recommendations = anime.recommendations?.nodes ?? [];

  return (
    <div className="pb-12 space-y-10">
      <AnimeHero anime={anime} />

      <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <AnimeInfo anime={anime} />
            <EpisodeGrid
              animeId={anime.id}
              animeTitle={getTitle(anime.title)}
              episodeCount={anime.episodes}
              nextAiringEpisode={anime.nextAiringEpisode}
            />
          </div>
          <div className="space-y-8">
            {/* Bug 8 fix: wrap AllAnimeCrossReference in Suspense — slow AllAnime API
                shouldn't block the entire detail page render */}
            <Suspense fallback={<div className="rounded-lg border border-xan-border bg-xan-card/50 p-4 animate-shimmer h-48" />}>
              <AllAnimeCrossReference
                anilistId={anime.id}
                anilistTitle={getTitle(anime.title)}
              />
            </Suspense>
            <CharacterList characters={characters} />
          </div>
        </div>
        <RelatedAnime relations={relations} recommendations={recommendations} />
      </div>
    </div>
  );
}
