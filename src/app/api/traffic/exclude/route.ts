import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Body = { keys?: string[]; label?: string; platform?: string; exclude?: boolean };

/**
 * { keys: ["src:taboola:123", "rtc:abc"], label, platform, exclude: true }  → ignores those campaigns' spend.
 * { keys, exclude: false } → counts them again.
 */
export async function POST(req: Request) {
  const { keys = [], label = "", platform = "", exclude = true } = (await req.json()) as Body;
  const valid = keys.filter((k) => /^(src:[a-z]+:.+|rtc:.+)$/.test(k));
  if (!valid.length) return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });
  const current = (await getSettings()).excludedCampaigns ?? [];
  const drop = new Set(valid.map((k) => k.toLowerCase()));
  const rest = current.filter((e) => !drop.has(e.key.toLowerCase()));
  const at = new Date().toISOString();
  const next = exclude ? [...rest, ...valid.map((key) => ({ key, label: label || key, platform, at }))] : rest;
  await saveSettings({ excludedCampaigns: next });
  return NextResponse.json({ ok: true, excluded: next });
}
