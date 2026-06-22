// lib/constants.ts
// XAN shared constants

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
  "School",
  "Shounen",
  "Seinen",
  "Isekai",
] as const;

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
  { label: "Search", href: "/search" },
  { label: "History", href: "/history" },
] as const;

// ✅ tiny base64 placeholder for missing cover images (Bug #23)
export const PLACEHOLDER_BLUR =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='12'>
      <rect width='8' height='12' fill='#1a1a1a'/>
    </svg>`,
  ).toString("base64");
