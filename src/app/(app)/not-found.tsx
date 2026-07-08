// app/(app)/not-found.tsx
// ✅ In-app 404 — keeps the Navbar + Footer layout so users can navigate away.
//    Falls through to the root not-found.tsx for true root-level 404s.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Ghost, Search, Compass } from "lucide-react";

export default function AppNotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-xan-crimson/20 to-xan-violet/20 flex items-center justify-center mx-auto mb-6">
        <Ghost className="h-10 w-10 text-xan-crimson" />
      </div>
      <p className="text-6xl font-display font-extrabold bg-gradient-to-r from-xan-crimson to-xan-violet bg-clip-text text-transparent">
        404
      </p>
      <h2 className="text-xl font-semibold text-foreground mt-3">
        Anime not found
      </h2>
      <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
        The page or anime you&apos;re looking for doesn&apos;t exist, may have been
        removed, or the URL is incorrect.
      </p>
      <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
        <Button
          asChild
          className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
        >
          <Link href="/home">
            <Home className="h-4 w-4 mr-1.5" />
            Back to home
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-xan-border text-foreground hover:bg-xan-card"
        >
          <Link href="/discover">
            <Compass className="h-4 w-4 mr-1.5" />
            Discover anime
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-xan-border text-foreground hover:bg-xan-card"
        >
          <Link href="/search">
            <Search className="h-4 w-4 mr-1.5" />
            Search
          </Link>
        </Button>
      </div>
    </div>
  );
}
