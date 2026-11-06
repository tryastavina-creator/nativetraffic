import { NextResponse } from "next/server";
import { describe } from "@/lib/adCopy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** { headlines: string[] } → an aggressive description for each, matching its headline. */
export async function POST(req: Request) {
  const { headlines } = (await req.json()) as { headlines?: string[] };
  const list = (headlines ?? []).map((h) => String(h).trim()).filter(Boolean).slice(0, 30);
  if (!list.length) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await describe(list) });
}
