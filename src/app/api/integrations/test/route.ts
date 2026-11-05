import { NextResponse } from "next/server";
import { testConnection } from "@/lib/connectors";
import { getConnection, redact, saveConnection } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  const conn = await getConnection(id);
  if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  const result = await testConnection(conn);
  Object.assign(conn, {
    lastTestAt: new Date().toISOString(),
    lastTestOk: result.ok,
    lastTestMessage: result.message,
  });
  await saveConnection(conn);
  return NextResponse.json({ connection: redact(conn), result });
}
