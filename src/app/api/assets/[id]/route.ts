import { getAsset } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public on purpose: Revcontent downloads the ad image from a URL. Ids are 32 random hex
 * chars, so images can't be listed or guessed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await getAsset(id);
  if (!a) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { "Content-Type": a.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
