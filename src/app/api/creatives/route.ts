import { NextResponse } from "next/server";
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
        for (const cr of await listCreatives(a.credentials, range)) {
          items.push({ ...cr, accountId: a.id, accountLabel: a.label ?? "Taboola", platform: "taboola" });
        }
      } catch (e) {
        warnings.push(`${a.label ?? "Taboola"}: ${(e as Error).message}`);
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
