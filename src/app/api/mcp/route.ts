import { NextResponse } from "next/server";
import { mcp } from "@/lib/connectors";
import { getConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

/** { id } → list tools · { id, tool, args } → call a tool on a connected MCP server. */
export async function POST(req: Request) {
  const { id, tool, args } = (await req.json()) as { id: string; tool?: string; args?: Record<string, unknown> };
  const conn = await getConnection(id);
  if (!conn || conn.provider !== "mcp") return NextResponse.json({ error: "Servidor MCP não encontrado" }, { status: 404 });
  try {
    if (tool) return NextResponse.json({ result: await mcp.callTool(conn.credentials, tool, args ?? {}) });
    return NextResponse.json({ tools: await mcp.listTools(conn.credentials) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
