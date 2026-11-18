import "server-only";
import { tbHeaders } from "./connectors/campaignBuilder";
import { http } from "./connectors/http";
import { TRAFFIC_CONNECTORS } from "./connectors/traffic";
import { rangeFromPreset } from "./metrics";
import { listArchivedConnections, listConnections, saveConnection } from "./store";
import type { Connection } from "./types";

/**
 * Brings back the Taboola accounts that were disconnected before the history existed. The API keys of a connected
 * Taboola account usually also open the other accounts of the same login (allowed-accounts); every one of those with
 * spend in the last 180 days, and not connected, is added as a disconnected account: it never shows in Tráfego, but
 * its spend and ads count in the Dashboard and in Criativos (read straight from the Taboola reports).
 * Read-only on Taboola: nothing in the accounts changes.
 */
const TB = "https://backstage.taboola.com/backstage/api/1.0";
export type FoundAccount = { accountId: string; name: string; spend180: number; added: boolean; note?: string };

export async function recoverTaboolaAccounts(): Promise<{ found: FoundAccount[]; errors: string[] }> {
  const [active, archived] = await Promise.all([listConnections(), listArchivedConnections()]);
  const tb = active.filter((c) => c.provider === "taboola");
  const known = new Set([...active, ...archived].filter((c) => c.provider === "taboola").map((c) => String(c.credentials.accountId)));
  const found: FoundAccount[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const to = rangeFromPreset("today").to;
  const range = { from: new Date(Date.parse(`${to}T00:00:00Z`) - 179 * 86400_000).toISOString().slice(0, 10), to };

  for (const c of tb) {
    let list: { account_id?: string; name?: string; type?: string }[] = [];
    try {
      const r = await http<{ results?: { account_id?: string; name?: string; type?: string }[] }>(`${TB}/users/current/allowed-accounts`, {
        headers: await tbHeaders(c.credentials),
      });
      list = r.results ?? [];
    } catch (e) {
      errors.push(`${c.label ?? "Taboola"}: ${String((e as Error).message).slice(0, 120)}`);
      continue;
    }
    // A network account's reports already include its advertisers: nothing is missing under it.
    const self = list.find((a) => String(a.account_id) === String(c.credentials.accountId));
    const underNetwork = self?.type === "NETWORK";
    for (const a of list) {
      const id = String(a.account_id ?? "");
      if (!id || known.has(id) || seen.has(id) || a.type === "NETWORK") continue;
      seen.add(id);
      const name = String(a.name ?? id);
      if (underNetwork) {
        found.push({ accountId: id, name, spend180: 0, added: false, note: "já somada pela conta de rede" });
        continue;
      }
      const creds = { ...c.credentials, accountId: id };
      let spend180 = 0;
      try {
        spend180 = (await TRAFFIC_CONNECTORS.taboola.fetchSpend(creds, range)).reduce((s, r) => s + r.spend, 0);
      } catch (e) {
        found.push({ accountId: id, name, spend180: 0, added: false, note: `sem acesso aos relatórios (${String((e as Error).message).slice(0, 80)})` });
        continue;
      }
      if (spend180 < 0.01) {
        found.push({ accountId: id, name, spend180: 0, added: false, note: "sem gasto em 180 dias" });
        continue;
      }
      const now = new Date().toISOString();
      const conn: Connection = {
        id: `taboola:rec-${id.toLowerCase().replace(/[^a-z0-9-]/g, "")}`,
        provider: "taboola",
        label: name,
        credentials: creds,
        createdAt: now,
        lastTestAt: now,
        lastTestOk: true,
        lastTestMessage: `Recuperada: US$${spend180.toFixed(2)} de gasto em 180 dias`,
        archivedAt: now,
      };
      await saveConnection(conn);
      known.add(id);
      found.push({ accountId: id, name, spend180, added: true });
    }
  }
  return { found, errors };
}

/** Runs once after each server start and then once a day (from the background warmer). */
let lastRecover = 0;
export async function autoRecover() {
  if (Date.now() - lastRecover < 24 * 3600_000) return;
  lastRecover = Date.now();
  await recoverTaboolaAccounts().catch(() => {});
}
