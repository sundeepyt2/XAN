import { z } from "zod";

// ─── Title Schema ───
export const AnimeTitleSchema = z.object({
  romaji: z.string().nullable().default(null),
  english: z.string().nullable().default(null),
  native: z.string().nullable().default(null),
});

// ─── Trailer Schema ───
export const AnimeTrailerSchema = z
  .object({
    id: z.string().nullable().default(null),
    site: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

// ─── Next Airing Episode Schema ───
export const NextAiringEpisodeSchema = z
  .object({
    airingAt: z.number(),
    episode: z.number(),
    timeUntilAiring: z.number(),
  })
  .nullable()
  .default(null);

export type NextAiringEpisode = z.infer<typeof NextAiringEpisodeSchema>;

// ─── Cover Image Schema ───
export const CoverImageSchema = z
  .object({
    large: z.string(), // ✅ NOT z.string().url() — AniList returns protocol-relative URLs
    color: z.string().nullable().default(null),
  })
  .nullable()
  .default(null);

// ─── Main Anime Schema ───
export const AnimeSchema = z.object({
  id: z.number(),
  title: AnimeTitleSchema,
  coverImage: CoverImageSchema,
  bannerImage: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  averageScore: z.number().nullable().default(null),
  episodes: z.number().nullable().default(null),
  status: z
    .enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"])
    .nullable()
    .default(null),
  genres: z.array(z.string()).default([]),
  season: z
    .enum(["WINTER", "SPRING", "SUMMER", "FALL"])
    .nullable()
    .default(null),
  seasonYear: z.number().nullable().default(null),
  format: z
    .enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"])
    .nullable()
    .default(null),
  trending: z.number().nullable().default(null),
  popularity: z.number().nullable().default(null),
  trailer: AnimeTrailerSchema,
  nextAiringEpisode: NextAiringEpisodeSchema,
});

export type Anime = z.infer<typeof AnimeSchema>;
export type AnimeTitle = z.infer<typeof AnimeTitleSchema>;

// ─── Page Info Schema ───
export const PageInfoSchema = z.object({
  currentPage: z.number().default(1),
  hasNextPage: z.boolean().default(false),
  lastPage: z.number().nullable().default(null),
  perPage: z.number().default(20),
  total: z.number().nullable().default(null),
});

export type PageInfo = z.infer<typeof PageInfoSchema>;

// ─── Relation Edge Schema (for detail page) ───
export const RelationEdgeSchema = z.object({
  relationType: z.string().nullable().default(null),
  node: z.object({
    id: z.number(),
    title: z.object({
      romaji: z.string().nullable().default(null),
      english: z.string().nullable().default(null),
    }),
    coverImage: z.object({
      large: z.string(),
    }),
    format: z.string().nullable().default(null),
    status: z.string().nullable().default(null),
  }),
});

export type RelationEdge = z.infer<typeof RelationEdgeSchema>;

// ─── Character Edge Schema ───
export const CharacterEdgeSchema = z.object({
  role: z.string().nullable().default(null),
  node: z.object({
    id: z.number(),
    name: z.object({ full: z.string().nullable().default(null) }),
    image: z
      .object({ medium: z.string().nullable().default(null) })
      .nullable()
      .default(null),
  }),
});

export type CharacterEdge = z.infer<typeof CharacterEdgeSchema>;

// ─── Recommendation Schema ───
export const RecommendationSchema = z.object({
  mediaRecommendation: z
    .object({
      id: z.number(),
      title: z.object({
        romaji: z.string().nullable().default(null),
        english: z.string().nullable().default(null),
      }),
      coverImage: z.object({ large: z.string() }),
      averageScore: z.number().nullable().default(null),
    })
    .nullable()
    .default(null),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

// ─── Detailed Anime Schema (with relations, characters, recommendations) ───
export const AnimeDetailSchema = AnimeSchema.extend({
  relations: z
    .object({
      edges: z.array(RelationEdgeSchema).default([]),
    })
    .nullable()
    .default(null),
  characters: z
    .object({
      edges: z.array(CharacterEdgeSchema).default([]),
    })
    .nullable()
    .default(null),
  recommendations: z
    .object({
      nodes: z.array(RecommendationSchema).default([]),
    })
    .nullable()
    .default(null),
});

export type AnimeDetail = z.infer<typeof AnimeDetailSchema>;

// ─── Airing Schedule Schema (Feature 3) ───
export const AiringScheduleSchema = z.object({
  id: z.number(),
  airingAt: z.number(),
  episode: z.number(),
  media: z
    .object({
      id: z.number(),
      title: AnimeTitleSchema,
      coverImage: z
        .object({
          large: z.string(),
          color: z.string().nullable().default(null),
        })
        .nullable()
        .default(null),
      episodes: z.number().nullable().default(null),
      format: z.string().nullable().default(null),
      status: z.string().nullable().default(null),
      averageScore: z.number().nullable().default(null),
      genres: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
});
export type AiringSchedule = z.infer<typeof AiringScheduleSchema>;

// ─── Helper: Safe title extraction ───
export function getTitle(title: AnimeTitle | null | undefined): string {
  if (!title) return "Untitled";
  return title.english ?? title.romaji ?? title.native ?? "Untitled";
}

// ─── Helper: Strip HTML from AniList descriptions ───
export function sanitizeDescription(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ─── Helper: Format score ───
export function formatScore(score: number | null): string {
  if (score == null) return "N/A";
  return `${score}%`;
}

// ─── Helper: Format episodes ───
export function formatEpisodes(episodes: number | null): string {
  if (episodes == null) return "Ongoing";
  return `${episodes} eps`;
}

// ─── Helper: Format year/season ───
export function formatSeason(
  season: Anime["season"],
  year: Anime["seasonYear"] | null,
): string {
  if (!season && !year) return "Unknown";
  if (!season) return String(year ?? "—");
  if (!year) return season;
  return `${season} ${year}`;
}

// ─── Helper: Status display ───
export function formatStatus(status: Anime["status"]): string {
  if (!status) return "Unknown";
  const map: Record<NonNullable<Anime["status"]>, string> = {
    FINISHED: "Finished",
    RELEASING: "Releasing",
    NOT_YET_RELEASED: "Not Released",
    CANCELLED: "Cancelled",
    HIATUS: "Hiatus",
  };
  return map[status];
}
