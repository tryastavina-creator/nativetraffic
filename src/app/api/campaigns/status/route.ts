import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { resolveAccount } from "@/lib/campaigns";
import { setCampaignActive } from "@/lib/connectors/campaignBuilder";

export const dynamic = "force-dynamic";

/** { accountId, campaignId, active } → turns a Taboola / Revcontent campaign on or off. */
export async function POST(req: Request) {
  const { accountId, campaignId, active } = (await req.json()) as { accountId?: string; campaignId?: string; active?: boolean };
  const acc = accountId ? await resolveAccount(accountId) : undefined;
  if (!acc || (acc.provider !== "taboola" && acc.provider !== "revcontent") || !campaignId || typeof active !== "boolean") {
    return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });
  }
  try {
    await setCampaignActive(acc.provider, acc.credentials, campaignId, active);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(acc.label ?? acc.provider, e) }, { status: 400 });
  }
}
