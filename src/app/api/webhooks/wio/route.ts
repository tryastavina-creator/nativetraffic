import { NextResponse } from "next/server";
import { wio } from "@/lib/connectors";
import { appendEvent, getConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

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
  let payload: unknown;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  await appendEvent("wio", payload);
  return NextResponse.json({ ok: true });
}
