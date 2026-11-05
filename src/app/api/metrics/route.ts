import { NextResponse } from "next/server";
import { computeMetrics, rangeFromPreset } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const range = rangeFromPreset(
    u.searchParams.get("preset") ?? "14d",
    u.searchParams.get("from") ?? undefined,
    u.searchParams.get("to") ?? undefined,
  );
  return NextResponse.json(await computeMetrics(range));
}
