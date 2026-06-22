// app/not-found.tsx
// Server Component — custom 404

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Ghost } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-xan-crimson/20 to-xan-violet/20 flex items-center justify-center mx-auto mb-6">
          <Ghost className="h-10 w-10 text-xan-crimson" />
        </div>
        <p className="text-6xl font-display font-extrabold bg-gradient-to-r from-xan-crimson to-xan-violet bg-clip-text text-transparent">
          404
        </p>
        <h2 className="text-xl font-semibold text-foreground mt-3">
          Page not found
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button
          asChild
          className="mt-6 bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
        >
          <Link href="/home">
            <Home className="h-4 w-4 mr-1.5" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
