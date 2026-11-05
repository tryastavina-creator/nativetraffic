"use client";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/store";

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
  }, []);

  async function save() {
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    }).then((r) => r.json());
    setS(r);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return null;
  const numField = (key: keyof Settings, label: string, help: string) => (
    <label className="block">
      <span className="mb-1.5 block text-xs text-zinc-300">{label}</span>
      <input
        className="input"
        type="number"
        step="0.01"
        value={s[key] as number}
        onChange={(e) => setS({ ...s, [key]: parseFloat(e.target.value) || 0 })}
      />
      <span className="mt-1 block text-[11px] text-faint">{help}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-muted">Premissas usadas no cálculo do lucro.</p>

      <div className="card card-pad mt-6 space-y-5">
        {numField("paymentFeePercent", "Taxa do processador (%)", "Percentual cobrado pela WIO/gateway sobre cada pedido.")}
        {numField("paymentFeeFixed", "Taxa fixa por pedido", "Valor fixo por transação.")}
        {numField("defaultCogsPercent", "COGS padrão (% do preço)", "Usado quando a variante não tem custo cadastrado na Shopify.")}
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Fonte do custo de tráfego</span>
          <select
            className="input"
            value={s.spendSource}
            onChange={(e) => setS({ ...s, spendSource: e.target.value as Settings["spendSource"] })}
          >
            <option value="traffic">APIs das plataformas (RedTrack só preenche o que faltar)</option>
            <option value="redtrack">RedTrack para tudo</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Moeda</span>
          <input className="input" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} />
        </label>
        <button onClick={save} className="btn-primary">
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
