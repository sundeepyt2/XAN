"use client";

// components/watch/VideoEnhancerFilters.tsx
// ✅ Renders an invisible inline-SVG <defs> block containing the dynamic
//    `xan-enhancer` filter used by the <video> element.
//
// The filter chains two primitives:
//   1. <feComponentTransfer type="gamma" exponent={gamma}> — gamma correction
//      applied to R/G/B channels. exponent=1 is identity. <1 brightens midtones,
//      >1 darkens midtones. Standard gamma math: out = in^exponent.
//   2. <feConvolveMatrix order="3" kernel="0 -s 0  -s 1+4s -s 0  -s 0"> —
//      sharpen convolution. s=0 is identity; s=1 is a strong sharpen kernel.
//      We scale the user's `sharpen` (0–100) to s (0–1) for the kernel.
//
// The SVG is rendered as a 0×0 hidden block — the filter is referenced by
// the <video> element via `filter: url(#xan-enhancer)`. No visual footprint.
//
// React re-renders the SVG defs whenever the gamma/sharpen values change,
// which causes the browser to recompile the filter pipeline. This is fast
// (microseconds) and happens only when the user drags a slider — not on
// every frame.

import { memo } from "react";
import type { EnhancerState } from "@/hooks/useVideoEnhancer";

interface VideoEnhancerFiltersProps {
  state: EnhancerState;
}

function VideoEnhancerFiltersInner({ state }: VideoEnhancerFiltersProps) {
  const { gamma, sharpen } = state;

  // ✅ Scale sharpen (0–100) → kernel amount s (0–1).
  // s=0 → identity kernel (no sharpening)
  // s=1 → strong sharpen (center=5, sides=-1)
  // We use s = sharpen/100 so the slider maps linearly to sharpening strength.
  const s = Math.max(0, Math.min(1, sharpen / 100));
  const center = 1 + 4 * s;
  const side = -s;
  // 3x3 kernel (row-major): [0, -s, 0, -s, 1+4s, -s, 0, -s, 0]
  const kernel = `0 ${side.toFixed(4)} 0 ${side.toFixed(4)} ${center.toFixed(4)} ${side.toFixed(4)} 0 ${side.toFixed(4)} 0`;

  // ✅ Format gamma exponent with enough precision to be smooth on the slider
  // (0.01 steps) but not so much that the SVG re-renders unnecessarily.
  const exponent = gamma.toFixed(3);

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        left: 0,
        top: 0,
        pointerEvents: "none",
        opacity: 0,
      }}
    >
      <defs>
        <filter id="xan-enhancer" colorInterpolationFilters="sRGB">
          {/* ── Gamma correction ──
              Applied to R/G/B channels. Alpha (feFuncA) is left as identity.
              exponent=1 → no change. */}
          <feComponentTransfer>
            <feFuncR type="gamma" exponent={exponent} amplitude="1" offset="0" />
            <feFuncG type="gamma" exponent={exponent} amplitude="1" offset="0" />
            <feFuncB type="gamma" exponent={exponent} amplitude="1" offset="0" />
            <feFuncA type="identity" />
          </feComponentTransfer>

          {/* ── Sharpen convolution ──
              3×3 kernel. When s=0, this is identity (0 0 0 / 0 1 0 / 0 0 0).
              preserveAlpha=true so the alpha channel isn't convolved. */}
          {s > 0 && (
            <feConvolveMatrix
              order="3"
              kernelMatrix={kernel}
              divisor={1}
              bias={0}
              targetX={1}
              targetY={1}
              edgeMode="duplicate"
              preserveAlpha={true}
            />
          )}
        </filter>
      </defs>
    </svg>
  );
}

export const VideoEnhancerFilters = memo(VideoEnhancerFiltersInner);
