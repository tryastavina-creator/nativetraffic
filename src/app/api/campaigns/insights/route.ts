import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/cache";
import { campaignAds, campaignSites, setAdActive, setDailyBudget, setGroupDailyBudget, setSiteBlocked } from "@/lib/campaignInsights";
import { rangeFromPreset } from "@/lib/metrics";
import { resolveAccount } from "@/lib/campaigns";
import { rememberEdit, rememberGroupEdit } from "@/lib/trafficTree";

export const dynamic = "force-dynamic";

/** ?accountId=&campaignId=&kind=ads|sites&preset=… → the campaign's ads or sites with the source's numbers. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const accountId = q.get("accountId") ?? "";
  const campaignId = q.get("campaignId") ?? "";
  const range = rangeFromPreset(q.get("preset") ?? "7d", q.get("from") ?? undefined, q.get("to") ?? undefined);
  try {
    if (q.get("kind") === "sites") return NextResponse.json({ sites: await campaignSites(accountId, campaignId, range) });
    return NextResponse.json({ ads: await campaignAds(accountId, campaignId, range) });
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Fonte", e) }, { status: 400 });
  }
}

/**
 * { accountId, campaignId, kind: "ad" | "site", id, on } — on=true: ad active / site allowed.
 * { accountId, campaignId, kind: "budget", daily } — new daily budget.
 */
export async function POST(req: Request) {
  const b = (await req.json()) as { accountId?: string; campaignId?: string; kind?: string; id?: string; on?: boolean; daily?: number };
  if (b.kind === "groupBudget") {
    if (!b.accountId || !b.id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    try {
      await setGroupDailyBudget(b.accountId, b.id, Number(b.daily));
      rememberGroupEdit(b.id, Number(b.daily));
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: friendlyError("Fonte", e) }, { status: 400 });
    }
  }
  if (b.kind === "budget") {
    if (!b.accountId || !b.campaignId) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    try {
      await setDailyBudget(b.accountId, b.campaignId, Number(b.daily));
      const acc = await resolveAccount(b.accountId);
      if (acc) rememberEdit(acc.provider, b.campaignId, { dailyBudget: Number(b.daily) });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: friendlyError("Fonte", e) }, { status: 400 });
    }
  }
  if (!b.accountId || !b.campaignId || !b.id || typeof b.on !== "boolean") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    if (b.kind === "site") await setSiteBlocked(b.accountId, b.campaignId, b.id, !b.on);
    else await setAdActive(b.accountId, b.campaignId, b.id, b.on);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Fonte", e) }, { status: 400 });
  }
}
