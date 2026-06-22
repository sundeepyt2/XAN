"use client";

// components/ErrorCard.tsx
// Client Component — has built-in retry (calls window.location.reload())

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorCardProps {
  message?: string;
  /** When true, hide the retry button (e.g., for non-retryable errors) */
  hideRetry?: boolean;
}

export function ErrorCard({
  message = "Something went wrong",
  hideRetry = false,
}: ErrorCardProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl border border-xan-border bg-xan-card">
      <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
      <p className="text-foreground font-medium">{message}</p>
      <p className="text-muted-foreground text-sm mt-1">
        Please try again in a moment.
      </p>
      {!hideRetry && (
        <Button
          onClick={() => window.location.reload()}
          variant="secondary"
          size="sm"
          className="mt-4"
        >
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
