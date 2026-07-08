"use client";

// app/global-error.tsx
// ✅ Catches errors in the ROOT layout itself (layout.tsx, font loading,
//    ThemeProvider crash, etc.). The root error.tsx CANNOT catch these —
//    global-error.tsx replaces <html> and <body> entirely.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "32rem" }}>
          <div
            style={{
              width: "4rem",
              height: "4rem",
              borderRadius: "1rem",
              background:
                "linear-gradient(135deg, rgba(233,69,96,0.2), rgba(123,47,247,0.2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <AlertCircle style={{ width: "2rem", height: "2rem", color: "#e94560" }} />
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              margin: "0 0 0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                margin: "0.5rem 0 1.5rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "linear-gradient(to right, #e94560, #7b2ff7)",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
