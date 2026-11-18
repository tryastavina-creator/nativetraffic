import "server-only";
import { listRevcontent, listTaboola } from "./connectors/taboolaCreatives";
import { TRAFFIC_CONNECTORS } from "./connectors/traffic";
import { readCreativeBook, readSpendBook, recordCreativesDay, recordSpend } from "./history";
import { rangeFromPreset } from "./metrics";
import { listArchivedConnections, listConnections, uniqueAccounts } from "./store";

/**
 * Saves each ad's numbers day by day (Taboola and Revcontent), so the Criativos tab keeps the real spend of an
 * account after it is disconnected or loses API access. Runs from the background warmer: today and yesterday
 * every 20 minutes, and once per account the last 60 days.
 */
let lastRun = 0;
const BACKFILL_DAYS = 60;

export async function snapshotCreatives({ force = false } = {}) {
  if (!force && Date.now() - lastRun < 20 * 60_000) return;
  lastRun = Date.now();
  const [active, archived, book] = await Promise.all([listConnections(), listArchivedConnections(), readCreativeBook()]);
  const all = uniqueAccounts([...active, ...archived]);

  // Account spend: last 60 days once per account (so the month is complete), then today and yesterday.
  const spendBook = await readSpendBook();
  for (const a of all.filter((c) => TRAFFIC_CONNECTORS[c.provider])) {
    const to = a.archivedAt ? a.archivedAt.slice(0, 10) : rangeFromPreset("today").to;
    const has = Object.keys(spendBook[a.id]?.days ?? {}).length >= BACKFILL_DAYS;
    if (a.archivedAt && has) continue;
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (has ? 1 : BACKFILL_DAYS - 1));
    const range = { from: d.toISOString().slice(0, 10), to };
    try {
      await recordSpend(a, await TRAFFIC_CONNECTORS[a.provider].fetchSpend(a.credentials, range), range);
    } catch {
      /* source refused: keep what is saved */
    }
  }

  const accounts = all.filter((c) => c.provider === "taboola" || c.provider === "revcontent");
  for (const a of accounts) {
    const list = (date: string) =>
      a.provider === "taboola" ? listTaboola(a.credentials, { from: date, to: date }) : listRevcontent(a.credentials, { from: date, to: date });
    const days: string[] = [];
    if (!a.archivedAt) days.push(rangeFromPreset("today").from, rangeFromPreset("yesterday").from);
    if (!book[a.id]?.backfilled) {
      const last = a.archivedAt ? a.archivedAt.slice(0, 10) : rangeFromPreset("yesterday").from;
      for (let i = 0; i < BACKFILL_DAYS; i++) {
        const d = new Date(`${last}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        const s = d.toISOString().slice(0, 10);
        if (!days.includes(s)) days.push(s);
      }
    }
    let ok = 0;
    for (const [i, date] of days.entries()) {
      try {
        await recordCreativesDay(a, date, await list(date), { backfilled: i === days.length - 1 && !book[a.id]?.backfilled });
        ok++;
      } catch {
        // Source refused (banned account, bad key…): keep what is saved and move on.
        if (!ok) break;
      }
    }
  }
}
