import { NextResponse } from "next/server";
import { builderMeta, type Platform } from "@/lib/campaigns";
import { listCampaignLog, listConnections, uniqueAccounts } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ?platform=&accountId= → campaigns, groups, RedTrack campaigns (with link) and templates. No params → accounts + log. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const platform = q.get("platform") as Platform | null;
  const accountId = q.get("accountId");
  if (!platform || !accountId) {
    const conns = uniqueAccounts(await listConnections()).filter((c) => c.provider === "taboola" || c.provider === "revcontent");
    return NextResponse.json({
      accounts: conns.map((c) => ({ id: c.id, label: c.label ?? c.provider, platform: c.provider })),
      log: (await listCampaignLog()).slice(0, 50),
    });
  }
  try {
    return NextResponse.json(await builderMeta(platform, accountId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
