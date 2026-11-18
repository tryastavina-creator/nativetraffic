import { NextResponse } from "next/server";
import { snapshotCreatives } from "@/lib/creativeHistory";
import { recoverTaboolaAccounts } from "@/lib/recoverAccounts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Recuperar contas antigas": finds disconnected Taboola accounts of the same login and saves their history. */
export async function POST() {
  try {
    const r = await recoverTaboolaAccounts();
    if (r.found.some((f) => f.added)) snapshotCreatives({ force: true }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
