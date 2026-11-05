import { NextResponse } from "next/server";
import { rangeFromPreset } from "@/lib/metrics";
import { computeTraffic } from "@/lib/traffic";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const range = rangeFromPreset(q.get("preset") ?? "7d", q.get("from") ?? undefined, q.get("to") ?? undefined);
  if (range.from > range.to) return NextResponse.json({ error: "Data inicial depois da final" }, { status: 400 });
  return NextResponse.json(await computeTraffic(range));
}
