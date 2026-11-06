import { NextResponse } from "next/server";
import { describe, type CopyInput } from "@/lib/adCopy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * { items: [{ headline, imageUrl? }], product?, campaign?, variant? } (or { headlines: string[] })
 * → a direct-response description for each, built for the niche found in the headline / product / image.
 */
export async function POST(req: Request) {
  const b = (await req.json()) as { items?: CopyInput[]; headlines?: string[]; product?: string; campaign?: string; variant?: number };
  const items = (b.items ?? (b.headlines ?? []).map((headline): CopyInput => ({ headline })))
    .map((x) => ({ headline: String(x.headline ?? "").trim(), imageUrl: x.imageUrl }))
    .filter((x) => x.headline)
    .slice(0, 30);
  if (!items.length) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await describe(items, { product: b.product, campaign: b.campaign, variant: Number(b.variant) || 0 }) });
}
