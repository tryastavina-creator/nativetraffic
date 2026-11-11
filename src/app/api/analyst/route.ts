import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { runAnalysis } from "@/lib/analyst";
import { rangeFromPreset } from "@/lib/metrics";
import { listAnalyses, listConnections, saveAnalysis } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Past analyses (newest first) and whether the Claude key is connected. */
export async function GET() {
  const [analyses, conns] = await Promise.all([listAnalyses(), listConnections()]);
  return NextResponse.json({ analyses, connected: conns.some((c) => c.provider === "anthropic") || !!process.env.ANTHROPIC_API_KEY });
}

/** { preset, product?, count?, notes? } → analysis of the ads + Gemini prompts for a new campaign. */
export async function POST(req: Request) {
  const b = (await req.json()) as { preset?: string; product?: string; count?: number; notes?: string };
  const range = rangeFromPreset(b.preset ?? "30d");
  const count = Math.max(1, Math.min(8, Number(b.count) || 4));
  try {
    const r = await runAnalysis({ range, product: b.product, count, notes: b.notes?.slice(0, 600) });
    const item = { id: randomBytes(6).toString("hex"), at: new Date().toISOString(), product: (r.meta.product as string | null) ?? null, data: r };
    await saveAnalysis(item);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Analista", e) }, { status: 400 });
  }
}
