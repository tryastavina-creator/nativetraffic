import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteTemplate, saveTemplate, type CampaignTemplate } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as Partial<CampaignTemplate>;
  if (!b.name?.trim() || (b.platform !== "taboola" && b.platform !== "revcontent") || !b.setup) {
    return NextResponse.json({ error: "Dê um nome ao modelo." }, { status: 400 });
  }
  const t: CampaignTemplate = {
    id: b.id || randomBytes(6).toString("hex"),
    name: b.name.trim().slice(0, 80),
    platform: b.platform,
    setup: b.setup,
    updatedAt: new Date().toISOString(),
  };
  await saveTemplate(t);
  return NextResponse.json({ template: t });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
