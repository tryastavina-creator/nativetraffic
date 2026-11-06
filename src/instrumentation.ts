/**
 * Keeps the Tráfego numbers warm: right after the server starts and every few minutes, the default periods
 * are rebuilt in the background, so opening the tab never waits for the source APIs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NT_NO_WARM) return;
  const { computeTrafficTree } = await import("./lib/trafficTree");
  const { rangeFromPreset } = await import("./lib/metrics");
  const warm = async () => {
    for (const preset of ["today", "yesterday", "7d"]) {
      await computeTrafficTree(rangeFromPreset(preset)).catch(() => {});
    }
  };
  setTimeout(warm, 5_000);
  setInterval(warm, 3 * 60_000).unref?.();
}
