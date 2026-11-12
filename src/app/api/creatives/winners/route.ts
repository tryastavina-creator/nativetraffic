import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { IMAGE_MODELS, type ImageModelId } from "@/lib/creativeOptions";
import { rangeFromPreset } from "@/lib/metrics";
import { winnerVariants } from "@/lib/winnerVariants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** { preset?, product?, winners?, perWinner?, model? } → aggressive variants of the top images, saved in the library. */
export async function POST(req: Request) {
  const b = (await req.json()) as { preset?: string; product?: string; winners?: number; perWinner?: number; model?: string };
  const model = (IMAGE_MODELS.some((m) => m.id === b.model) ? b.model : "nano-banana") as ImageModelId;
  try {
    const r = await winnerVariants({
      range: rangeFromPreset(b.preset ?? "30d"),
      product: b.product,
      winners: Math.max(1, Math.min(5, Number(b.winners) || 3)),
      perWinner: Math.max(1, Math.min(4, Number(b.perWinner) || 3)),
      model,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Variações", e) }, { status: 400 });
  }
}
