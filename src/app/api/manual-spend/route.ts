import { NextResponse } from "next/server";
import { bustCache } from "@/lib/cache";
import { addManualSpend, deleteManualSpend, listManualSpend } from "@/lib/manualSpend";

export const dynamic = "force-dynamic";

/** Traffic spend typed by hand, per source (Configurações). */
export async function GET() {
  return NextResponse.json({ entries: await listManualSpend() });
}

export async function POST(req: Request) {
  try {
    const entry = await addManualSpend(await req.json());
    bustCache();
    return NextResponse.json({ entry, entries: await listManualSpend() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await deleteManualSpend(id);
  bustCache();
  return NextResponse.json({ entries: await listManualSpend() });
}
