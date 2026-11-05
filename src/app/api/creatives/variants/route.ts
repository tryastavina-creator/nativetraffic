import { NextResponse } from "next/server";
import { fal } from "@/lib/connectors";
import { listConnections } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** { imageUrl, instruction, count } → { images: string[] } (fal.ai / Gemini image). */
export async function POST(req: Request) {
  const { imageUrl, instruction, count } = (await req.json()) as { imageUrl?: string; instruction?: string; count?: number };
  if (!imageUrl || !/^https:\/\//.test(imageUrl)) return NextResponse.json({ error: "Imagem de origem inválida." }, { status: 400 });
  const key = (await listConnections()).find((c) => c.provider === "fal");
  if (!key) return NextResponse.json({ error: "Conecte a fal.ai em Integrações para gerar variações." }, { status: 400 });
  try {
    const images = await fal.generateVariants(key.credentials, imageUrl, instruction ?? "", count ?? 2);
    return NextResponse.json({ images });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
