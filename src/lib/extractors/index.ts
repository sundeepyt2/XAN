// lib/extractors/index.ts
// Barrel export for all stream extractors.

export {
  extractMegacloud,
  isMegacloudUrl,
  type ExtractedStream,
} from "./megacloud";
export { extractVixcloud, isVixcloudUrl } from "./vixcloud";
