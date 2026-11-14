import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { getSpy } from "@/lib/spy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Competitor spy collected by the Grok bot (branch spy-inbox): players, ads, reports, per niche. */
export async function GET() {
  try {
    return NextResponse.json(await getSpy());
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Spy (GitHub)", e) }, { status: 502 });
  }
}
