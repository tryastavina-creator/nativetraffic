import { NextResponse } from "next/server";
import { winners, type Platform } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

/** ?platform=taboola → campaigns that worked in the last 30 days (by real profit), to use as template. */
export async function GET(req: Request) {
  const platform = new URL(req.url).searchParams.get("platform") as Platform | null;
  if (platform !== "taboola" && platform !== "revcontent") return NextResponse.json({ winners: [] });
  try {
    return NextResponse.json({ winners: await winners(platform) });
  } catch {
    return NextResponse.json({ winners: [] });
  }
}
