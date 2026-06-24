"use client";

// components/watch/KeyboardShortcutsOverlay.tsx
// ✅ Modal showing all keyboard shortcuts.

import { useEffect } from "react";
import { X } from "lucide-react";

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["Space", "K"], action: "Play / Pause" },
  { keys: ["F"], action: "Toggle fullscreen" },
  { keys: ["M"], action: "Toggle mute" },
  { keys: ["←", "→"], action: "Seek ±10 seconds" },
  { keys: ["J", "L"], action: "Seek ±10 seconds (alt)" },
  { keys: ["↑", "↓"], action: "Volume ±10%" },
  { keys: [">", "<"], action: "Speed up / down" },
  { keys: ["P"], action: "Toggle Picture-in-Picture" },
  { keys: ["?"], action: "Show this help" },
  { keys: ["Esc"], action: "Close / Exit fullscreen" },
];

export function KeyboardShortcutsOverlay({
  open,
  onClose,
}: KeyboardShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-xan-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-bold text-foreground">
            Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-xan-border/50 last:border-0"
            >
              <span className="text-sm text-foreground">{s.action}</span>
              <div className="flex gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-xs font-mono bg-xan-card border border-xan-border rounded text-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Press <kbd className="px-1 py-0.5 bg-xan-card border border-xan-border rounded text-xs">Esc</kbd> or click outside to close
        </p>
      </div>
    </div>
  );
}
