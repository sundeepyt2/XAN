"use client";

// components/watch/SubDubToggle.tsx
// ✅ External SUB/DUB toggle — lives OUTSIDE the player on the watch page.
// ✅ Persists preference in localStorage — once you pick DUB, all future episodes
//    (and future visits) use DUB automatically until you switch back.
// ✅ Shows a notice when dub is requested but unavailable for the current anime.

import { useState, useEffect } from "react";
import { Languages, AlertCircle } from "lucide-react";

const STORAGE_KEY = "xan-preferred-mode";

interface SubDubToggleProps {
  /** Current mode (controlled by parent, synced with localStorage) */
  mode: "sub" | "dub";
  /** Called when user clicks SUB or DUB */
  onModeChange: (mode: "sub" | "dub") => void;
  /** Whether dub is available for this anime (from AllAnime cross-ref) */
  dubAvailable: boolean;
  /** Whether we're currently checking dub availability (loading state) */
  checkingDub: boolean;
  /** If true, dub was requested but fell back to sub for this episode */
  fellBackToSub?: boolean;
}

export function SubDubToggle({
  mode,
  onModeChange,
  dubAvailable,
  checkingDub,
  fellBackToSub,
}: SubDubToggleProps) {
  // Read persisted preference on mount (for the parent to use)
  // The actual persistence is done by the parent, this is just for display.

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* SUB/DUB toggle */}
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Audio:</span>
        <div className="flex items-center rounded-lg border border-xan-border overflow-hidden bg-xan-card">
          <button
            onClick={() => onModeChange("sub")}
            className={`px-3 py-1.5 text-xs font-bold transition-colors ${
              mode === "sub"
                ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-xan-card-hover"
            }`}
            title="Japanese audio with English subtitles"
          >
            SUB
          </button>
          <button
            onClick={() => dubAvailable && onModeChange("dub")}
            disabled={!dubAvailable || checkingDub}
            className={`px-3 py-1.5 text-xs font-bold transition-colors ${
              mode === "dub"
                ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-xan-card-hover"
            } ${!dubAvailable && !checkingDub ? "opacity-40 cursor-not-allowed" : ""} ${
              checkingDub ? "opacity-60 cursor-wait" : ""
            }`}
            title={
              checkingDub
                ? "Checking dub availability…"
                : dubAvailable
                  ? "English dubbed audio"
                  : "Dub not available for this anime"
            }
          >
            {checkingDub ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                DUB
              </span>
            ) : (
              "DUB"
            )}
          </button>
        </div>
      </div>

      {/* Fallback notice — shown when dub was requested but fell back to sub */}
      {fellBackToSub && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-2.5 py-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>Dub stream not available for this episode — playing sub instead</span>
        </div>
      )}

      {/* Dub unavailable notice — shown when user wants dub but anime has none */}
      {mode === "dub" && !dubAvailable && !checkingDub && !fellBackToSub && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-xan-card/50 border border-xan-border rounded-md px-2.5 py-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>Dub not available for this anime — using sub</span>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to read/write the preferred sub/dub mode from localStorage.
 * Persists across episodes and sessions.
 */
export function usePreferredMode(): ["sub" | "dub", (mode: "sub" | "dub") => void] {
  const [mode, setMode] = useState<"sub" | "dub">("sub");

  useEffect(() => {
    // Read from localStorage on mount
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dub" || stored === "sub") {
        setMode(stored);
      }
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
  }, []);

  const updateMode = (newMode: "sub" | "dub") => {
    setMode(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // ignore
    }
  };

  return [mode, updateMode];
}
