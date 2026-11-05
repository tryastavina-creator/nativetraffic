import { NextResponse } from "next/server";
import { publishRevcontent, publishTaboola } from "@/lib/connectors/taboolaCreatives";
import { baseUrl } from "@/lib/shopifyOAuth";
import { getAsset, getConnection, listVariants, updateVariant } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** { variantId } → new ad PAUSED in the same campaign as the original ad, same landing URL (RedTrack link). */
export async function POST(req: Request) {
  const { variantId } = (await req.json()) as { variantId?: string };
  const v = (await listVariants()).find((x) => x.id === variantId);
  if (!v) return NextResponse.json({ error: "Variação não encontrada." }, { status: 404 });
  if (!v.headline.trim()) return NextResponse.json({ error: "Escreva a headline antes de subir." }, { status: 400 });
  const conn = await getConnection(v.source.accountId);
  if (!conn || conn.provider !== v.source.platform) return NextResponse.json({ error: "Conta da fonte não encontrada." }, { status: 404 });
  const asset = await getAsset(v.assetId);
  if (!asset) return NextResponse.json({ error: "Imagem da variação não encontrada." }, { status: 404 });

  try {
    const r =
      v.source.platform === "taboola"
        ? await publishTaboola(conn.credentials, v.source.campaignId, v.source.url, v.headline, asset)
        : await publishRevcontent(
            conn.credentials,
            v.source.campaignId,
            v.source.url,
            v.headline,
            v.source.brand ?? "",
            `${baseUrl(req)}/api/assets/${v.assetId}`,
          );
    const updated = await updateVariant(v.id, {
      status: "published",
      published: [...(v.published ?? []), { platform: v.source.platform, itemId: r.itemId, at: new Date().toISOString(), status: r.status }],
    });
    return NextResponse.json({ variant: updated, result: r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
