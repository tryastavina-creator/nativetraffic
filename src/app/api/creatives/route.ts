import { NextResponse } from "next/server";
import { computeCreatives } from "@/lib/creatives";
import { rangeFromPreset } from "@/lib/metrics";
import { listVariants } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Ads of every Taboola/Revcontent account grouped by image, headline and combo, plus the variant library. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const range = rangeFromPreset(q.get("preset") ?? "7d", q.get("from") ?? undefined, q.get("to") ?? undefined);
  const [data, variants] = await Promise.all([computeCreatives(range), listVariants()]);
  return NextResponse.json({ ...data, variants });
}
