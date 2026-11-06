import { NextResponse } from "next/server";
import { addToCampaign, copyCampaign, createCampaign, duplicateCampaign, retryFailed, updateCampaign } from "@/lib/campaigns";
import { baseUrl } from "@/lib/shopifyOAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** { action: "create" | "duplicate" | "add", ...input } — everything is created paused. */
export async function POST(req: Request) {
  const b = await req.json();
  const base = baseUrl(req);
  if (b.action === "create") {
    if (!b.name?.trim() || !b.url?.trim()) return NextResponse.json({ error: "Informe o nome e o link do RedTrack." }, { status: 400 });
    return NextResponse.json(await createCampaign(b, base));
  }
  if (b.action === "duplicate") {
    if (!b.name?.trim() || !b.sourceCampaignId) return NextResponse.json({ error: "Escolha a campanha e o nome da cópia." }, { status: 400 });
    return NextResponse.json(await duplicateCampaign(b, base));
  }
  if (b.action === "add") {
    if (!b.campaignId || !b.url?.trim() || !b.creatives?.length) {
      return NextResponse.json({ error: "Escolha a campanha, o link e pelo menos um criativo." }, { status: 400 });
    }
    return NextResponse.json(await addToCampaign(b, base));
  }
  if (b.action === "update") {
    if (!b.accountId || !b.campaignId || !b.name?.trim()) return NextResponse.json({ error: "Faltam dados da campanha." }, { status: 400 });
    return NextResponse.json(await updateCampaign({ itemChanges: [], creatives: [], ...b }, base));
  }
  if (b.action === "retry") {
    if (!b.logId) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    return NextResponse.json(await retryFailed(b.logId, base));
  }
  if (b.action === "copy") {
    if (!b.source?.accountId || !b.target?.accountId || !b.name?.trim()) {
      return NextResponse.json({ error: "Escolha a conta de destino e o nome da cópia." }, { status: 400 });
    }
    if (!b.url?.trim() && (b.keep?.length || b.creatives?.length) && !(b.keepAll && b.source.accountId === b.target.accountId)) {
      return NextResponse.json({ error: "Informe o link do RedTrack para os anúncios da cópia." }, { status: 400 });
    }
    return NextResponse.json(await copyCampaign({ keep: [], keepAll: false, creatives: [], ...b }, base));
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
