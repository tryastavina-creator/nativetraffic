import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { getSpy, getSpyReport } from "@/lib/spy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Competitor spy collected by the Grok bot (branch spy-inbox): players, ads, reports, per niche.
 * ?fresh=1 checks GitHub right now; ?report=spy/relatorios/<file>.md returns one report from the history.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    const report = u.searchParams.get("report");
    if (report) return NextResponse.json({ markdown: await getSpyReport(report) });
    return NextResponse.json(await getSpy({ fresh: u.searchParams.get("fresh") === "1" }));
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Spy (GitHub)", e) }, { status: 502 });
  }
}
