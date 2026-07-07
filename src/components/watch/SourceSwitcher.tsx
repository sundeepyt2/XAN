"use client";

// components/watch/SourceSwitcher.tsx
// ✅ animex.one-style Sources panel — grouped by provider, grid layout
// ✅ Shows source name + type badge (mp4/hls/iframe) + bandwidth-tier preview
// ✅ Click any source to instantly switch (preserves playback position)
// ✅ Failed sources show a red ❌ indicator
// ✅ Active source highlighted with crimson border
// ✅ ⭐ Recommended badge on the best source
// ✅ Tier preview badges predict which tier each source would use:
//       🟢 DIRECT  — no headers needed, browser loads direct
//       🟢 DIRECT+ — HLS with headers, manifest-proxy will be used (~5KB)
//       ☁️ CF      — CF Worker will handle it (0 Vercel BW)
//       🟡 PROXIED — full-proxy fallback (uses Vercel BW)

import { Zap, Cloud, Shield, AlertCircle, Check, Star, MonitorPlay } from "lucide-react";

export interface SourceItem {
  url: string;
  type: "hls" | "mp4" | "dash" | "iframe";
  quality: string | null;
  headers?: Record<string, string>;
  sourceName?: string;
  provider?: string;
}

interface SourceSwitcherProps {
  sources: SourceItem[];
  currentSourceIdx: number;
  failedSourceIdxs: Set<number>;
  onSelectSource: (idx: number) => void;
  /** Index of the recommended (most bandwidth-friendly) source — shows ⭐ badge */
  recommendedIdx?: number;
  /** Provider priority order — providers are displayed in this order */
  providerPriority?: string[];
  className?: string;
}

// ✅ CF Worker URL — read once at module load (same pattern as YouTubeStylePlayer)
const CF_WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL ?? "";

// ✅ Hosts that are known to BLOCK Cloudflare Worker IPs.
// When the CF Worker fetches these, they return 403/404, so the player
// falls back to full-proxy (Vercel). The tier preview badge must reflect
// this — show PROXIED instead of CF for these hosts.
const CF_BLOCKING_HOSTS = [
  "tools.fast4speed.rsvp",
  "mp4upload.com",
];

function isCFBlocking(url: string): boolean {
  try {
    const u = new URL(url);
    return CF_BLOCKING_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

/**
 * Predict which bandwidth tier a source would land on, based on its type,
 * whether it needs headers, and whether the host blocks CF Worker IPs.
 * This is a PREVIEW — the actual tier is only known after playback starts.
 */
function predictTier(
  source: SourceItem,
): "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" {
  const hasHeaders = source.headers && Object.keys(source.headers).length > 0;

  // iframe sources load direct — no headers, no proxy
  if (source.type === "iframe") return "direct";

  // No headers → direct always works
  if (!hasHeaders) return "direct";

  // HLS with headers → manifest-proxy tier (server fetches .m3u8, segments direct)
  if (source.type === "hls") return "manifest-proxy";

  // MP4/DASH with headers:
  //   - If host is known to block CF → full-proxy (CF will fail, fallback to Vercel)
  //   - If CF Worker is configured AND host doesn't block CF → cf-proxy (0 Vercel BW)
  //   - Else → full-proxy (uses Vercel BW)
  if (CF_WORKER_URL && !isCFBlocking(source.url)) return "cf-proxy";
  return "full-proxy";
}

/**
 * Score a source by bandwidth-friendliness (higher = better).
 * Used to pick the "Recommended" source on first load.
 *
 * Ranking rationale:
 *   1. no-headers DIRECT (100) — 0 Vercel BW, keeps custom player UI
 *   2. CF Worker (95)          — 0 Vercel BW, keeps custom UI, depends on CF
 *   3. iframe DIRECT (90)      — 0 Vercel BW, but loses custom UI (iframe)
 *   4. manifest-proxy (80)     — ~5KB Vercel BW (HLS only), keeps custom UI
 *   5. full-proxy (10)         — full Vercel BW, last resort
 */
export function scoreSource(source: SourceItem): number {
  const tier = predictTier(source);
  const hasHeaders = source.headers && Object.keys(source.headers).length > 0;

  if (tier === "direct") {
    // Distinguish iframe (loses custom UI) from no-headers direct (keeps UI)
    if (source.type === "iframe") return 90;
    if (!hasHeaders) return 100;
    return 100;
  }
  if (tier === "cf-proxy") return 95;
  if (tier === "manifest-proxy") return 80;
  return 10; // full-proxy
}

/**
 * Find the index of the most bandwidth-friendly source.
 * Returns -1 if the array is empty.
 * Ties are broken by lower index (first occurrence wins).
 */
export function findRecommendedSourceIdx(sources: SourceItem[]): number {
  if (sources.length === 0) return -1;
  let bestIdx = 0;
  let bestScore = scoreSource(sources[0]);
  for (let i = 1; i < sources.length; i++) {
    const score = scoreSource(sources[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function TierPreviewBadge({ tier }: { tier: ReturnType<typeof predictTier> }) {
  if (tier === "direct") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-400/20"
        title="Direct — 0 server bandwidth"
      >
        <Zap className="h-2 w-2" />
        DIRECT
      </span>
    );
  }
  if (tier === "manifest-proxy") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400/80 border border-emerald-400/15"
        title="Manifest proxy — ~5KB server bandwidth (HLS only)"
      >
        <Zap className="h-2 w-2" />
        DIRECT+
      </span>
    );
  }
  if (tier === "cf-proxy") {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-400/20"
        title="Cloudflare Worker — 0 Vercel bandwidth"
      >
        <Cloud className="h-2 w-2" />
        CF
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-400/20"
      title="Full proxy — uses Vercel bandwidth"
    >
      <Shield className="h-2 w-2" />
      PROXIED
    </span>
  );
}

export function SourceSwitcher({
  sources,
  currentSourceIdx,
  failedSourceIdxs,
  onSelectSource,
  recommendedIdx,
  providerPriority = [],
  className = "",
}: SourceSwitcherProps) {
  if (sources.length === 0) return null;

  // ✅ Group sources by provider, in priority order
  const providerOrder = providerPriority.length > 0
    ? providerPriority
    : [...new Set(sources.map((s) => s.provider ?? "allanime"))];

  // Also include any providers not in the priority list
  for (const s of sources) {
    const p = s.provider ?? "allanime";
    if (!providerOrder.includes(p)) providerOrder.push(p);
  }

  const providerGroups = providerOrder.map((providerId) => ({
    providerId,
    label: providerId === "allanime" ? "AllAnime"
      : providerId === "isekai2nd" ? "Isekai2nd"
      : providerId === "zen" ? "Zen"
      : providerId === "koto" ? "Koto"
      : providerId === "pahe" ? "AnimePahe"
      : providerId === "gogoanime" ? "Gogoanime"
      : providerId.charAt(0).toUpperCase() + providerId.slice(1),
    sources: sources.map((s, idx) => ({ s, idx })).filter(({ s }) => (s.provider ?? "allanime") === providerId),
  })).filter((g) => g.sources.length > 0);

  return (
    <div className={`glass rounded-2xl p-4 ${className}`}>
      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <MonitorPlay className="h-4 w-4 text-xan-crimson" />
        Servers
        <span className="text-xs text-muted-foreground font-normal">
          ({sources.length})
        </span>
      </h3>

      {/* Provider groups */}
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1 no-scrollbar">
        {providerGroups.map((group) => (
          <div key={group.providerId}>
            {/* Provider header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {group.sources.length}
              </span>
              {/* Provider priority indicator */}
              {providerPriority.length > 0 && (
                <span className="text-[9px] text-muted-foreground/40 ml-auto">
                  #{providerPriority.indexOf(group.providerId) + 1}
                </span>
              )}
            </div>

            {/* Source grid — 5 columns like animex.one */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
              {group.sources.map(({ s: source, idx }) => {
                const isActive = idx === currentSourceIdx;
                const isFailed = failedSourceIdxs.has(idx);
                const isRecommended = idx === recommendedIdx && !isFailed;
                return (
                  <button
                    key={`${idx}-${source.url.slice(0, 40)}`}
                    onClick={() => onSelectSource(idx)}
                    disabled={isFailed && !isActive}
                    title={source.sourceName ?? `Source ${idx + 1}`}
                    className={`relative px-2 py-1.5 rounded-md text-[10px] font-medium transition-all flex flex-col items-center gap-0.5 ${
                      isActive
                        ? "bg-xan-crimson/20 text-foreground border border-xan-crimson/50"
                        : isFailed
                          ? "bg-red-500/5 text-muted-foreground/40 border border-transparent cursor-not-allowed"
                          : isRecommended
                            ? "bg-emerald-500/10 text-foreground border border-emerald-400/30 hover:bg-emerald-500/15"
                            : "bg-xan-card/60 text-muted-foreground border border-transparent hover:bg-xan-card-hover hover:text-foreground"
                    }`}
                  >
                    {/* Status icon */}
                    <div className="flex items-center gap-0.5">
                      {isActive ? (
                        <Check className="h-2.5 w-2.5 text-xan-crimson" />
                      ) : isFailed ? (
                        <AlertCircle className="h-2.5 w-2.5 text-red-400/60" />
                      ) : isRecommended ? (
                        <Star className="h-2.5 w-2.5 text-emerald-400 fill-emerald-400" />
                      ) : null}
                      <span className="font-mono truncate max-w-[60px]">
                        {source.sourceName ?? `S${idx + 1}`}
                      </span>
                    </div>
                    {/* Type + tier badges */}
                    <div className="flex items-center gap-0.5">
                      <TierPreviewBadge tier={predictTier(source)} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-3 pt-2 border-t border-xan-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {failedSourceIdxs.size > 0
            ? `${failedSourceIdxs.size} failed`
            : "Click any server to switch"}
        </span>
        <span>
          {sources.filter((s) => {
            const t = predictTier(s);
            return t === "direct" || t === "manifest-proxy" || t === "cf-proxy";
          }).length} bandwidth-friendly
        </span>
      </div>

      {/* Hint text — animex.one style */}
      <p className="mt-1.5 text-center text-[10px] leading-snug text-muted-foreground/60 select-none md:text-left">
        If current server doesn't work please try other servers beside.
      </p>
    </div>
  );
}
