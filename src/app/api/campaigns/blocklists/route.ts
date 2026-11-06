import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSettings, saveSettings, type Blocklist } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Site (Taboola) / widget (Revcontent) blocklists reused when creating campaigns. */
export async function GET() {
  return NextResponse.json({ blocklists: (await getSettings()).blocklists ?? [] });
}

/** { id?, name, platform, sites: string[] | string } → creates or replaces a list. */
export async function POST(req: Request) {
  const b = (await req.json()) as { id?: string; name?: string; platform?: string; sites?: string[] | string };
  if (!b.name?.trim() || (b.platform !== "taboola" && b.platform !== "revcontent")) {
    return NextResponse.json({ error: "Dê um nome e escolha a fonte." }, { status: 400 });
  }
  const raw = Array.isArray(b.sites) ? b.sites : String(b.sites ?? "").split(/[\s,;]+/);
  const sites = [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
  const lists = [...((await getSettings()).blocklists ?? [])];
  const item: Blocklist = { id: b.id || randomBytes(5).toString("hex"), name: b.name.trim(), platform: b.platform, sites, updatedAt: new Date().toISOString() };
  const i = lists.findIndex((x) => x.id === item.id);
  if (i >= 0) lists[i] = item;
  else lists.push(item);
  await saveSettings({ blocklists: lists });
  return NextResponse.json({ ok: true, blocklist: item, blocklists: lists });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const lists = ((await getSettings()).blocklists ?? []).filter((x) => x.id !== id);
  await saveSettings({ blocklists: lists });
  return NextResponse.json({ ok: true, blocklists: lists });
}
