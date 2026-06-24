"use client";

// components/watch/VerificationBadge.tsx
// ✅ Bug 3 fix: Removed outdated CF cookie message.
// The new AllAnime pipeline uses persisted GraphQL queries (no CF cookie needed).

import Link from "next/link";
import { ShieldCheck, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function VerificationBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      <Badge
        variant="outline"
        className="border-xan-crimson/30 text-xan-crimson bg-xan-crimson/5"
      >
        <Server className="h-3 w-3 mr-1" />
        AllAnime Streaming
      </Badge>

      <Link
        href="/settings"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <ShieldCheck className="h-3 w-3 text-emerald-500" />
        <span className="text-emerald-500">Real streams enabled</span>
      </Link>
    </div>
  );
}
