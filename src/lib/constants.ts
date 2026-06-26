// lib/constants.ts
// XAN shared constants

// ✅ Bug #8 fix: GENRES now contains only actual AniList genres.
// Shounen / Seinen / Isekai / School / Josei / Shoujo are AniList **tags**, not
// genres — querying them via `genre_in` silently returns 0 results. They live
// in the new TAGS array below and are routed through `tag_in` instead.
export const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
  "Psychological",
  "Mecha",
  "Music",
] as const;

export const TAGS = [
  { label: "Shounen", value: "Shounen" },
  { label: "Seinen", value: "Seinen" },
  { label: "Shoujo", value: "Shoujo" },
  { label: "Josei", value: "Josei" },
  { label: "Isekai", value: "Isekai" },
  { label: "School Life", value: "School Life" },
] as const;

export const TAG_VALUES = new Set<string>(TAGS.map((t) => t.value));

export function isTag(value: string): boolean {
  return TAG_VALUES.has(value);
}

export const SORT_OPTIONS = [
  { label: "Popularity", value: "POPULARITY_DESC" },
  { label: "Trending", value: "TRENDING_DESC" },
  { label: "Score", value: "SCORE_DESC" },
  { label: "Newest", value: "START_DATE_DESC" },
  { label: "Oldest", value: "START_DATE_ASC" },
  { label: "Title (A-Z)", value: "TITLE_ROMAJI_ASC" },
] as const;

export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

export const FORMATS = [
  "TV",
  "TV_SHORT",
  "MOVIE",
  "SPECIAL",
  "OVA",
  "ONA",
  "MUSIC",
] as const;

export const STATUSES = [
  { label: "Finished", value: "FINISHED" },
  { label: "Releasing", value: "RELEASING" },
  { label: "Not Released", value: "NOT_YET_RELEASED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Hiatus", value: "HIATUS" },
] as const;

export const YEARS = (() => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 1; y >= 1970; y--) {
    years.push(y);
  }
  return years;
})();

export const SITE = {
  name: "XAN",
  tagline: "Stream anime without the noise.",
  description:
    "Discover, search, and watch your favorite anime. Built with the AniList API.",
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/home" },
  { label: "Trending", href: "/trending" },
  { label: "History", href: "/history" },
] as const;

// ✅ Edge runtime compat: use btoa instead of Buffer.from().toString("base64")
export const PLACEHOLDER_BLUR =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='12'>
      <rect width='8' height='12' fill='#1a1a1a'/>
    </svg>`,
  );
