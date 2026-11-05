/**
 * WIO order processor.
 *
 * The exact API shape depends on the WIO account/docs you were given, so this
 * connector is deliberately configurable: base URL, orders path and a webhook
 * secret. Incoming webhooks are stored by /api/webhooks/wio and can be used to
 * reconcile refunds / chargebacks against Shopify.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Credentials, TestResult } from "../types";
import { http } from "./http";

export async function test(c: Credentials): Promise<TestResult> {
  const url = new URL(c.ordersPath || "/v1/orders", c.baseUrl);
  url.searchParams.set("limit", "1");
  await http(url.toString(), {
    headers: { Authorization: `Bearer ${c.apiKey}`, "X-API-Key": c.apiKey, Accept: "application/json" },
  });
  return { ok: true, message: "Endpoint de pedidos respondeu com sucesso" };
}

export function verifySignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = signature.replace(/^sha256=/, "");
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
