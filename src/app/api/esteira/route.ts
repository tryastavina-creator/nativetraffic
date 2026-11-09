import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth";
import {
  addRef,
  createProduct,
  deleteProduct,
  deleteRef,
  getEsteira,
  importJson,
  moveProduct,
  updateProduct,
  uploadThumb,
} from "@/lib/esteira";
import type { Stage } from "@/lib/esteiraShared";

export const dynamic = "force-dynamic";

/**
 * Product pipeline. Outside the middleware (thumb uploads carry an image in the body), so it checks the login itself.
 *  GET                                             → { products, refs }
 *  POST { action: "create", product }              → { product }
 *  POST { action: "update", id, patch }            → { product }
 *  POST { action: "move", id, stage, beforeId? }   → { product }
 *  POST { action: "delete", id }
 *  POST { action: "thumb", data: "data:image/…" }  → { thumb }   (asset id)
 *  POST { action: "addRef", ref } · { action: "deleteRef", id }
 *  POST { action: "import", json }                 → { added, updated, refsAdded }
 */
export async function GET(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  return NextResponse.json(await getEsteira());
}

export async function POST(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id : "";
    switch (b.action) {
      case "create":
        return NextResponse.json({ product: await createProduct((b.product ?? {}) as Record<string, unknown>) });
      case "update":
        return NextResponse.json({ product: await updateProduct(id, (b.patch ?? {}) as Record<string, unknown>) });
      case "move":
        return NextResponse.json({
          product: await moveProduct(id, b.stage as Stage, typeof b.beforeId === "string" ? b.beforeId : undefined),
        });
      case "delete":
        await deleteProduct(id);
        return NextResponse.json({ ok: true });
      case "thumb":
        return NextResponse.json({ thumb: await uploadThumb(String(b.data ?? "")) });
      case "addRef":
        return NextResponse.json({ ref: await addRef((b.ref ?? {}) as Record<string, unknown>) });
      case "deleteRef":
        await deleteRef(id);
        return NextResponse.json({ ok: true });
      case "import":
        return NextResponse.json(await importJson(b.json));
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Erro ao salvar." }, { status: 400 });
  }
}
