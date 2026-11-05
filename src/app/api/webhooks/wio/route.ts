import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { wio } from "@/lib/connectors";
import { getConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "wio-events.json");

/** Point WIO's webhook (orders, refunds, chargebacks) to: https://<seu-dominio>/api/webhooks/wio */
export async function POST(req: Request) {
  const raw = await req.text();
  const conn = await getConnection("wio");
  const secret = conn?.credentials.webhookSecret;
  if (secret) {
    const sig = req.headers.get("x-wio-signature") ?? req.headers.get("x-signature");
    if (!wio.verifySignature(secret, raw, sig)) {
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
  }
  let events: unknown[] = [];
  try {
    events = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}
  events.push({ receivedAt: new Date().toISOString(), payload: JSON.parse(raw || "{}") });
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(events.slice(-5000)));
  return NextResponse.json({ ok: true });
}
