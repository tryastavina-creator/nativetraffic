import { NextResponse } from "next/server";
import { testConnection } from "@/lib/connectors";
import { MCP_TEMPLATE, PROVIDERS, getProvider } from "@/lib/registry";
import { deleteConnection, getConnection, listConnections, redact, saveConnection } from "@/lib/store";
import type { Connection } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const connections = (await listConnections()).map(redact);
  return NextResponse.json({ providers: PROVIDERS, mcpTemplate: MCP_TEMPLATE, connections });
}

export async function POST(req: Request) {
  try {
    return await upsert(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function upsert(req: Request) {
  const body = (await req.json()) as { id?: string; provider: string; credentials: Record<string, string> };
  const def = getProvider(body.provider);
  if (!def) return NextResponse.json({ error: "Provedor desconhecido" }, { status: 400 });

  const id =
    body.id ??
    (body.provider === "mcp"
      ? `mcp:${(body.credentials.name || "server").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : body.provider);
  const existing = await getConnection(id);

  // Keep stored secrets when the form sends back the masked value.
  const credentials: Record<string, string> = {};
  for (const f of def.fields) {
    const v = (body.credentials[f.key] ?? "").trim();
    credentials[f.key] = v.startsWith("••••") ? (existing?.credentials[f.key] ?? "") : v;
    if (!f.optional && !credentials[f.key]) {
      return NextResponse.json({ error: `Campo obrigatório: ${f.label}` }, { status: 400 });
    }
  }

  const conn: Connection = {
    id,
    provider: body.provider,
    label: body.provider === "mcp" ? credentials.name : def.name,
    credentials,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const result = await testConnection(conn);
  Object.assign(conn, {
    lastTestAt: new Date().toISOString(),
    lastTestOk: result.ok,
    lastTestMessage: result.message,
  });
  await saveConnection(conn);
  return NextResponse.json({ connection: redact(conn), result });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await deleteConnection(id);
  return NextResponse.json({ ok: true });
}
