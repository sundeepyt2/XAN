// components/allanime/AllAnimeCrossReference.tsx
// Server Component — shows AllAnime metadata alongside AniList on the detail page.
// Provides episode counts (sub/dub/raw), AllAnime score, and a link to AllAnime.

import { findShowByAniListId } from "@/lib/allanime";
import Link from "next/link";
import { ExternalLink, Tv, Film, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AllAnimeCrossReferenceProps {
  anilistId: number;
  anilistTitle: string;
}

export async function AllAnimeCrossReference({
  anilistId,
  anilistTitle,
}: AllAnimeCrossReferenceProps) {
  const show = await findShowByAniListId(anilistId, anilistTitle);

  if (!show) {
    return null;
  }

  const sub = show.availableEpisodes?.sub ?? 0;
  const dub = show.availableEpisodes?.dub ?? 0;
  const raw = show.availableEpisodes?.raw ?? 0;
  const hasStreams = sub > 0 || dub > 0 || raw > 0;

  return (
    <section className="rounded-lg border border-xan-border bg-xan-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
            AA
          </span>
          AllAnime Cross-Reference
        </h3>
        {show.score != null && (
          <Badge variant="outline" className="border-xan-border text-muted-foreground">
            Score: {show.score.toFixed(2)}
          </Badge>
        )}
      </div>

      {/* Episode availability */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-xan-card p-2 text-center">
          <div className="text-xs text-muted-foreground">SUB</div>
          <div className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            {sub > 0 ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {sub}
              </>
            ) : (
              <XCircle className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="rounded-md bg-xan-card p-2 text-center">
          <div className="text-xs text-muted-foreground">DUB</div>
          <div className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            {dub > 0 ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {dub}
              </>
            ) : (
              <XCircle className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="rounded-md bg-xan-card p-2 text-center">
          <div className="text-xs text-muted-foreground">RAW</div>
          <div className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            {raw > 0 ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {raw}
              </>
            ) : (
              <XCircle className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="text-xs text-muted-foreground space-y-1">
        {show.type && (
          <div className="flex items-center gap-1.5">
            {show.type === "TV" ? (
              <Tv className="h-3 w-3" />
            ) : (
              <Film className="h-3 w-3" />
            )}
            Type: <span className="text-foreground">{show.type}</span>
          </div>
        )}
        {show.countryOfOrigin && (
          <div>
            Origin: <span className="text-foreground">{show.countryOfOrigin}</span>
          </div>
        )}
        {show.aniListId && (
          <div>
            AniList ID: <span className="text-foreground font-mono">{show.aniListId}</span>
            {show.malId && (
              <>
                {" "}· MAL ID: <span className="text-foreground font-mono">{show.malId}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Streaming note + link */}
      <div className="pt-2 border-t border-xan-border space-y-2">
        {hasStreams ? (
          <p className="text-xs text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
            Streamable on AllAnime (via watch page)
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No streams available on AllAnime
          </p>
        )}
        <Link
          href={`https://allmanga.to/anime/${show._id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View on AllAnime
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
