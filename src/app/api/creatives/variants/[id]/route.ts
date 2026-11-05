import { NextResponse } from "next/server";
import { deleteVariant, updateVariant } from "@/lib/store";

export const dynamic = "force-dynamic";

/** { headline?, status? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { headline?: string; status?: "new" | "archived" };
  const patch: Record<string, unknown> = {};
  if (typeof b.headline === "string") patch.headline = b.headline.slice(0, 100);
  if (b.status === "new" || b.status === "archived") patch.status = b.status;
  const v = await updateVariant(id, patch);
  if (!v) return NextResponse.json({ error: "Variação não encontrada." }, { status: 404 });
  return NextResponse.json({ variant: v });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteVariant(id);
  return NextResponse.json({ ok: true });
}
