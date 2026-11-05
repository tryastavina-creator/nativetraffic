import { NextResponse } from "next/server";
import { campaignDetail } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

/** ?accountId=&campaignId= → settings and ads of an existing campaign. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const accountId = q.get("accountId");
  const campaignId = q.get("campaignId");
  if (!accountId || !campaignId) return NextResponse.json({ error: "Faltam conta e campanha." }, { status: 400 });
  try {
    return NextResponse.json(await campaignDetail(accountId, campaignId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
