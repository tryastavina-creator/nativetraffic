import { NextResponse } from "next/server";
import { resolveAccount } from "@/lib/campaigns";
import { taboolaGroup } from "@/lib/connectors/campaignBuilder";
import { friendlyError } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** ?accountId=&id= → budget / KPI of a Taboola campaign group (to know if campaigns need their own budget). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const acc = await resolveAccount(q.get("accountId") ?? "");
  const id = q.get("id");
  if (!acc || acc.provider !== "taboola" || !id) return NextResponse.json({ error: "Grupo inválido." }, { status: 400 });
  try {
    return NextResponse.json(await taboolaGroup(acc.credentials, id));
  } catch (e) {
    return NextResponse.json({ error: friendlyError("Taboola", e) }, { status: 400 });
  }
}
