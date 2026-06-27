"use client";

// components/watch/KeyboardShortcutsOverlay.tsx
import { useEffect } from "react";
import { X } from "lucide-react";

interface KeyboardShortcutsOverlayProps {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  action: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["Space", "K"], action: "Play / Pause" },
  { keys: ["F"], action: "Toggle fullscreen" },
  { keys: ["M"], action: "Toggle mute" },
  { keys: ["←", "→"], action: "Seek ±10 seconds" },
  { keys: ["J", "L"], action: "Seek ±10 seconds (alt)" },
  { keys: ["↑", "↓"], action: "Volume ±10%" },
  { keys: [">", "<"], action: "Speed up / down" },
  { keys: ["0", "9"], action: "Seek to 0% / 90%" },
  { keys: ["P"], action: "Toggle Picture-in-Picture" },
  { keys: ["T"], action: "Toggle time display (remaining)" },
  { keys: ["R"], action: "Toggle loop" },
  { keys: ["N"], action: "Next episode" },
  { keys: ["?"], action: "Show this help" },
  { keys: ["Esc"], action: "Close overlays" },
];

export function KeyboardShortcutsOverlay({ onClose }: KeyboardShortcutsOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full mx-4 rounded-xl border border-xan-border bg-xan-card/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            aria-label="Close shortcuts help"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white/5 border border-xan-border"
            >
              <span className="text-sm text-muted-foreground">{s.action}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="min-w-[24px] text-center px-1.5 py-0.5 rounded bg-xan-card text-foreground text-xs font-mono border border-xan-border shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-xan-card text-foreground text-xs font-mono border border-xan-border">Esc</kbd> or click outside to close.
        </p>
      </div>
    </div>
  );
}
