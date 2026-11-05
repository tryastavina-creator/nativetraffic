import { NextResponse } from "next/server";
import { cached, friendlyError, hashKey } from "@/lib/cache";
import { listCreatives, type Creative } from "@/lib/connectors/taboolaCreatives";
import { rangeFromPreset } from "@/lib/metrics";
import { listConnections } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Creatives running on every connected Taboola account, with performance for the period. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const range = rangeFromPreset(q.get("preset") ?? "7d", q.get("from") ?? undefined, q.get("to") ?? undefined);
  const conns = await listConnections();
  const accounts = conns.filter((c) => c.provider === "taboola");
  const warnings: string[] = [];
  const items: (Creative & { accountId: string; accountLabel: string; platform: string })[] = [];
  await Promise.all(
    accounts.map(async (a) => {
      try {
        const list = (await cached(hashKey("creatives", a.id, a.credentials, range), () => listCreatives(a.credentials, range))).value;
        for (const cr of list) {
          items.push({ ...cr, accountId: a.id, accountLabel: a.label ?? "Taboola", platform: "taboola" });
        }
      } catch (e) {
        warnings.push(friendlyError(a.label ?? "Taboola", e));
      }
    }),
  );
  items.sort((a, b) => b.spend - a.spend);
  return NextResponse.json({
    range,
    items,
    warnings,
    accounts: accounts.map((a) => ({ id: a.id, label: a.label ?? "Taboola" })),
    hasImageAi: conns.some((c) => c.provider === "fal"),
  });
}
