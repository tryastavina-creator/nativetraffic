import type { Connection, TestResult } from "../types";
import * as fal from "./fal";
import * as mcp from "./mcp";
import * as redtrack from "./redtrack";
import * as shopify from "./shopify";
import { TRAFFIC_CONNECTORS } from "./traffic";
import * as wio from "./wio";

export async function testConnection(conn: Connection): Promise<TestResult> {
  const c = conn.credentials;
  try {
    if (conn.provider === "mcp") return await mcp.test(c);
    if (conn.provider === "shopify") return await shopify.test(c);
    if (conn.provider === "redtrack") return await redtrack.test(c);
    if (conn.provider === "wio") return await wio.test(c);
    if (conn.provider === "fal") return await fal.test(c);
    const t = TRAFFIC_CONNECTORS[conn.provider];
    if (t) return await t.test(c);
    return { ok: false, message: "Conector ainda não implementado — credenciais salvas." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export { fal, mcp, redtrack, shopify, TRAFFIC_CONNECTORS, wio };
