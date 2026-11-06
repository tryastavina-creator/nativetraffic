import { NextResponse } from "next/server";
import { builderMeta, campaignAccounts, type Platform } from "@/lib/campaigns";
import { listCampaignLog } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ?platform=&accountId= → campaigns, groups, RedTrack campaigns (with link) and templates. No params → accounts + log. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const platform = q.get("platform") as Platform | null;
  const accountId = q.get("accountId");
  if (!platform || !accountId) {
    return NextResponse.json({
      accounts: await campaignAccounts(),
      log: (await listCampaignLog()).slice(0, 50),
    });
  }
  try {
    return NextResponse.json(await builderMeta(platform, accountId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
