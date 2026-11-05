import { NextResponse } from "next/server";
import { getSettings, saveSettings, type Settings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<Settings>;
  await saveSettings(patch);
  return NextResponse.json(await getSettings());
}
