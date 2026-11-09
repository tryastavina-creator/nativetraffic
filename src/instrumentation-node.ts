/**
 * Keeps the Tráfego and Criativos numbers warm: right after the server starts and every few minutes, the default periods
 * are rebuilt in the background, so opening the tab never waits for the source APIs. Node runtime only.
 */
import { cachedCreatives } from "./lib/creatives";
import { rangeFromPreset } from "./lib/metrics";
import { computeTrafficTree } from "./lib/trafficTree";

if (!process.env.NT_NO_WARM) {
  const warm = async () => {
    for (const preset of ["today", "yesterday", "7d"]) {
      await computeTrafficTree(rangeFromPreset(preset)).catch(() => {});
    }
    // Creatives (Criativos tab and the campaign creative picker).
    for (const preset of ["30d", "7d"]) await cachedCreatives(rangeFromPreset(preset)).catch(() => {});
  };
  setTimeout(warm, 5_000);
  setInterval(warm, 3 * 60_000).unref?.();
}
