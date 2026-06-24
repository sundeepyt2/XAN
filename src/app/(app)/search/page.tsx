"use client";

// app/(app)/search/page.tsx
// ✅ "use client" — input state + URL params

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search as SearchIcon, SearchX } from "lucide-react";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterPanel } from "@/components/search/FilterPanel";
import { AnimeCard } from "@/components/cards/AnimeCard";
import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/useDebounce";
import type { Anime, PageInfo } from "@/types/anime";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQ = searchParams.get("q") || "";
  const initialGenres = searchParams.get("genres")?.split(",").filter(Boolean) ?? [];
  const initialTags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const initialSort = searchParams.get("sort") || "POPULARITY_DESC";

  const [query, setQuery] = useState(initialQ);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [sort, setSort] = useState(initialSort);
  const [format, setFormat] = useState("");
  const [data, setData] = useState<Anime[] | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  // Update URL when query/genres/tags/sort change (shareable)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    if (sort && sort !== "POPULARITY_DESC") params.set("sort", sort);
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    setPage(1);
  }, [debouncedQuery, selectedGenres, selectedTags, sort, router]);

  // Fetch results
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      page: String(page),
      perPage: "24",
      sort,
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));

    fetch(`/api/search?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        if (!cancelled) {
          setData((json?.data ?? []) as Anime[]);
          setPageInfo(json?.pageInfo ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedGenres, selectedTags, sort, page]);

  const handleGenreToggle = useCallback((genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }, []);

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const handleClearTags = useCallback(() => setSelectedTags([]), []);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <SearchIcon className="h-6 w-6 text-xan-crimson" />
          Search
        </h1>
        <p className="text-sm text-muted-foreground">
          Find anime by title, filter by genre, and sort however you like.
        </p>
      </div>

      {/* Search bar */}
      <SearchBar value={query} onChange={setQuery} />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar filters */}
        <FilterPanel
          selectedGenres={selectedGenres}
          onGenreToggle={handleGenreToggle}
          onClearGenres={() => setSelectedGenres([])}
          sort={sort}
          onSortChange={setSort}
          format={format}
          onFormatChange={setFormat}
          total={data?.length}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          onClearTags={handleClearTags}
        />

        {/* Results */}
        <div className="space-y-4 min-w-0">
          {error ? (
            <ErrorCard message="Search failed. Please try again." />
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 12 }, (_, i) => (
                <AnimeCardSkeleton key={i} />
              ))}
            </div>
          ) : data && data.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {data.map((item, idx) => (
                  <AnimeCard key={item.id} anime={item} index={idx} />
                ))}
              </div>

              {/* Pagination */}
              {pageInfo && (page > 1 || pageInfo.hasNextPage) && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="bg-xan-card border-xan-border hover:bg-xan-card-hover disabled:opacity-40"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-3">
                    Page {page}
                    {pageInfo.lastPage ? ` of ${pageInfo.lastPage}` : ""}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!pageInfo.hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                    className="bg-xan-card border-xan-border hover:bg-xan-card-hover disabled:opacity-40"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-xan-border bg-xan-card/50 py-16 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium">No results found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search term or adjust filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
