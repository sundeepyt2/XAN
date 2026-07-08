"use client";

// components/allanime/DevInfoToggle.tsx
// ✅ Collapsible "Technical details" section for AllAnimeCrossReference.
//    Hides AniList ID, MAL ID, AllAnime score, type, country — dev-facing
//    info that casual users don't need. Collapsed by default.

import { useState } from "react";
import { ChevronDown, Tv, Film, Code2 } from "lucide-react";

interface DevInfoToggleProps {
  type?: string | null;
  countryOfOrigin?: string | null;
  aniListId?: string | null;
  malId?: string | null;
  score?: number | null;
}

export function DevInfoToggle({
  type,
  countryOfOrigin,
  aniListId,
  malId,
  score,
}: DevInfoToggleProps) {
  const [open, setOpen] = useState(false);

  // Don't render the toggle at all if there's no dev info
  if (!type && !countryOfOrigin && !aniListId && !malId && score == null) {
    return null;
  }

  return (
    <div className="pt-2 border-t border-xan-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <Code2 className="h-3 w-3" />
        Technical details
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 text-xs text-muted-foreground space-y-1 animate-panel-up">
          {type && (
            <div className="flex items-center gap-1.5">
              {type === "TV" ? (
                <Tv className="h-3 w-3" />
              ) : (
                <Film className="h-3 w-3" />
              )}
              Type: <span className="text-foreground">{type}</span>
            </div>
          )}
          {countryOfOrigin && (
            <div>
              Origin: <span className="text-foreground">{countryOfOrigin}</span>
            </div>
          )}
          {score != null && (
            <div>
              AllAnime Score:{" "}
              <span className="text-foreground font-mono">{score.toFixed(2)}</span>
            </div>
          )}
          {aniListId && (
            <div>
              AniList ID:{" "}
              <span className="text-foreground font-mono">{aniListId}</span>
              {malId && (
                <>
                  {" "}
                  · MAL ID:{" "}
                  <span className="text-foreground font-mono">{malId}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
