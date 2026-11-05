import { NextResponse } from "next/server";
import { computeMetrics, previousRange, rangeFromPreset } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ?preset=14d | custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 * &compare=none | previous | custom&cfrom=…&cto=…
 * Returns the current period, plus `previous` when a comparison is asked.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const range = rangeFromPreset(
    q.get("preset") ?? "14d",
    q.get("from") ?? undefined,
    q.get("to") ?? undefined,
  );
  if (range.from > range.to) return NextResponse.json({ error: "Data inicial depois da final" }, { status: 400 });

  const compare = q.get("compare") ?? "none";
  let compareRange = null;
  if (compare === "previous") compareRange = previousRange(range);
  if (compare === "custom" && isDate(q.get("cfrom")) && isDate(q.get("cto"))) {
    compareRange = { from: q.get("cfrom")!, to: q.get("cto")! };
  }

  const [current, previous] = await Promise.all([
    computeMetrics(range),
    compareRange ? computeMetrics(compareRange) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ...current, previous });
}
