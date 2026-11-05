/**
 * Minimal MCP client over Streamable HTTP (JSON-RPC 2.0).
 * Enough to: initialize, list tools and call a tool on any remote MCP server.
 */
import type { Credentials, TestResult } from "../types";

type RpcResponse = { result?: unknown; error?: { code: number; message: string } };

let rpcId = 0;

async function post(c: Credentials, body: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (c.authHeader) headers.Authorization = c.authHeader;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(c.url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  return { res, text };
}

function parse(text: string): RpcResponse | undefined {
  if (!text.trim()) return undefined;
  if (text.trimStart().startsWith("{")) return JSON.parse(text) as RpcResponse;
  // SSE: take the last `data:` line that holds a JSON-RPC response.
  const datas = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  for (let i = datas.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(datas[i]) as RpcResponse;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

async function session(c: Credentials) {
  const { res, text } = await post(c, {
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "nativetraffic-dashboard", version: "0.1.0" },
    },
  });
  const init = parse(text);
  if (init?.error) throw new Error(init.error.message);
  const sessionId = res.headers.get("mcp-session-id") ?? undefined;
  await post(c, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  return { sessionId, serverInfo: (init?.result as { serverInfo?: { name: string } })?.serverInfo };
}

async function call(c: Credentials, method: string, params: unknown) {
  const { sessionId } = await session(c);
  const { text } = await post(c, { jsonrpc: "2.0", id: ++rpcId, method, params }, sessionId);
  const r = parse(text);
  if (r?.error) throw new Error(r.error.message);
  return r?.result;
}

export async function listTools(c: Credentials) {
  const r = (await call(c, "tools/list", {})) as { tools?: { name: string; description?: string }[] };
  return r?.tools ?? [];
}

export async function callTool(c: Credentials, name: string, args: Record<string, unknown>) {
  return call(c, "tools/call", { name, arguments: args });
}

export async function test(c: Credentials): Promise<TestResult> {
  const { serverInfo } = await session(c);
  const tools = await listTools(c);
  return {
    ok: true,
    message: `${serverInfo?.name ?? "Servidor"} respondeu · ${tools.length} ferramentas`,
    details: tools.map((t) => t.name),
  };
}
