"use client";
import { useEffect, useState } from "react";

type Entry = { id: string; from: string; to: string; platform: string; amount: number; mode: "add" | "replace"; note?: string };

const SOURCES: [string, string][] = [
  ["taboola", "Taboola"],
  ["revcontent", "Revcontent"],
  ["outbrain", "Outbrain"],
  ["mediago", "MediaGo"],
  ["mgid", "MGID"],
  ["newsbreak", "NewsBreak"],
  ["meta", "Meta Ads"],
  ["googleads", "Google Ads"],
];
const label = (p: string) => SOURCES.find((s) => s[0] === p)?.[1] ?? p;
const br = (d: string) => d.split("-").reverse().join("/");
const today = () => new Date().toISOString().slice(0, 10);

/** Traffic spend typed by hand per source, for days an API didn't report. */
export default function ManualSpendCard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({ platform: "mediago", from: today(), to: today(), amount: "", mode: "add" as Entry["mode"], note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/manual-spend")
      .then((r) => r.json())
      .then((j) => setEntries(j.entries ?? []))
      .catch(() => {});
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/manual-spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount.replace(",", ".")) }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "Sem conexão." }));
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setEntries(r.entries);
    setForm({ ...form, amount: "", note: "" });
    setMsg({ ok: true, text: "Lançado. Dashboard recalculada." });
  }

  async function remove(id: string) {
    const r = await fetch(`/api/manual-spend?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((x) => x.json());
    setEntries(r.entries ?? []);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card card-pad space-y-4">
      <p className="text-xs text-muted">
        Para quando uma fonte não puxa o gasto (sem API, conta perdida, correção). Pode ser um dia ou um período: o valor de um período
        é dividido igualmente pelos dias. Entra na Dashboard, no lucro e no ROAS da fonte.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-300">Fonte</span>
          <select className="input" value={form.platform} onChange={set("platform")}>
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-300">Valor (US$)</span>
          <input className="input" inputMode="decimal" placeholder="250,00" value={form.amount} onChange={set("amount")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-300">De</span>
          <input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-300">Até</span>
          <input className="input" type="date" value={form.to} min={form.from} onChange={set("to")} />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs text-zinc-300">Como usar</span>
          <select className="input" value={form.mode} onChange={set("mode")}>
            <option value="add">Somar ao que a API já trouxe</option>
            <option value="replace">Substituir o gasto da API nesses dias</option>
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs text-zinc-300">
            Observação <span className="text-faint">opcional</span>
          </span>
          <input className="input" placeholder="ex.: MediaGo conta 2, fatura de novembro" value={form.note} onChange={set("note")} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !form.amount} onClick={add}>
          {busy ? "Salvando…" : "Lançar gasto"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-accent" : "text-bad"}`}>{msg.text}</span>}
      </div>
      {entries.length > 0 && (
        <table className="tbl w-full text-xs">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Período</th>
              <th className="text-right">Valor</th>
              <th>Modo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  {label(e.platform)}
                  {e.note && <div className="text-[11px] text-faint">{e.note}</div>}
                </td>
                <td className="text-muted">{e.from === e.to ? br(e.from) : `${br(e.from)} → ${br(e.to)}`}</td>
                <td className="text-right">US${e.amount.toFixed(2)}</td>
                <td className="text-muted">{e.mode === "replace" ? "substitui API" : "soma"}</td>
                <td className="text-right">
                  <button className="text-bad hover:underline" onClick={() => remove(e.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
