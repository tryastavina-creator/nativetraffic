/**
 * Keeps the Tráfego and Criativos numbers warm (see instrumentation-node.ts).
 * The import sits inside the NEXT_RUNTIME check so the Edge bundle never pulls Node-only modules (node:crypto…),
 * which breaks `next dev`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
