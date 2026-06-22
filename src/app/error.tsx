"use client";

// app/error.tsx
// ✅ Bug #4: REQUIRED by Next.js to be a client component

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-xan-crimson/20 to-xan-violet/20 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="h-8 w-8 text-xan-crimson" />
        </div>
        <h2 className="text-2xl font-display font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <Button
          onClick={reset}
          className="mt-6 bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
