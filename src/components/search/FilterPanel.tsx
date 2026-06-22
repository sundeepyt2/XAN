"use client";

// components/search/FilterPanel.tsx

import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GENRES, SORT_OPTIONS, FORMATS } from "@/lib/constants";

interface FilterPanelProps {
  selectedGenres: string[];
  onGenreToggle: (genre: string) => void;
  onClearGenres: () => void;
  sort: string;
  onSortChange: (v: string) => void;
  format: string;
  onFormatChange: (v: string) => void;
  total?: number;
}

export function FilterPanel({
  selectedGenres,
  onGenreToggle,
  onClearGenres,
  sort,
  onSortChange,
  format,
  onFormatChange,
  total,
}: FilterPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-xan-border bg-xan-card/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-xan-crimson" />
          Filters
        </h3>
        {selectedGenres.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearGenres}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Sort + format */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sort by</label>
          <Select value={sort} onValueChange={onSortChange}>
            <SelectTrigger className="h-9 bg-xan-card border-xan-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Format</label>
          <Select value={format || "ALL"} onValueChange={(v) => onFormatChange(v === "ALL" ? "" : v)}>
            <SelectTrigger className="h-9 bg-xan-card border-xan-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All formats</SelectItem>
              {FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Genres */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Genres {selectedGenres.length > 0 && `(${selectedGenres.length})`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((genre) => {
            const selected = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                onClick={() => onGenreToggle(genre)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  selected
                    ? "bg-xan-crimson/20 text-xan-crimson border-xan-crimson/40"
                    : "bg-xan-card text-muted-foreground hover:text-foreground border-xan-border"
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {typeof total === "number" && (
        <p className="text-xs text-muted-foreground pt-2 border-t border-xan-border">
          {total} result{total !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
