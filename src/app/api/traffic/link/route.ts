import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

/** { source: "taboola:123", target: "code:012" | null } — links (or unlinks) a source campaign. */
export async function POST(req: Request) {
  const { source, target } = (await req.json()) as { source?: string; target?: string | null };
  if (!source || !/^[a-z]+:.+/.test(source)) return NextResponse.json({ error: "Campanha da fonte inválida." }, { status: 400 });
  const links = { ...((await getSettings()).campaignLinks ?? {}) };
  if (target) links[source] = target;
  else delete links[source];
  await saveSettings({ campaignLinks: links });
  return NextResponse.json({ ok: true, links });
}
