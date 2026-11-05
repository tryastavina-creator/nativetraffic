"use client";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/store";

type CostRow = { product: string; cost: string };
type ImportResult = {
  orders: number;
  changes: { item: string; from: number | null; to: number }[];
  unresolved: string[];
  error?: string;
};
type ImportInfo = { at: string; file: string; orders: number };
const usd = (n: number) => `$${n.toFixed(2)}`;

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<{ imports: ImportInfo[]; orders: number } | null>(null);

  const applySettings = (data: Settings) => {
    setS(data);
    const rows = Object.entries(data.productCosts ?? {}).map(([product, cost]) => ({ product, cost: String(cost) }));
    setCosts(rows.length ? rows : [{ product: "", cost: "" }]);
  };
  const loadHistory = () =>
    fetch("/api/supplier")
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {});

  async function upload(file: File) {
    setUploading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/supplier", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => ({ error: "Falha no envio" }));
    setUploading(false);
    setResult(r);
    if (r.settings) applySettings(r.settings);
    loadHistory();
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(applySettings);
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!s) return;
    const productCosts: Record<string, number> = {};
    for (const r of costs) {
      const v = parseFloat(r.cost.replace(",", "."));
      if (r.product.trim() && Number.isFinite(v)) productCosts[r.product.trim()] = v;
    }
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, productCosts }),
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
        id={`set-${key}`}
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

      <h2 className="h-section">Fornecedor (Wiio)</h2>
      <div className="card card-pad space-y-5">
        <div className="rounded-lg border border-dashed border-line bg-bg p-4">
          <div className="text-sm font-medium">Importar planilha da Wiio</div>
          <p className="mt-1 text-xs text-muted">
            Exporte a lista de pedidos na Wiio (OrderList .xls) e envie aqui. O site guarda o custo exato de cada pedido e
            atualiza a tabela abaixo sozinho; pedidos novos usam essa tabela até o próximo envio.
          </p>
          <label className="btn-ghost mt-3 inline-flex cursor-pointer">
            {uploading ? "Lendo planilha…" : "Escolher arquivo .xls ou .csv"}
            <input
              id="supplier-file"
              type="file"
              accept=".xls,.csv"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
          {result?.error && <div className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{result.error}</div>}
          {result && !result.error && (
            <div className="mt-3 space-y-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
              <div className="text-accent">{result.orders} pedidos importados com o custo exato.</div>
              {result.changes.length > 0 ? (
                <ul className="space-y-0.5 text-zinc-300">
                  {result.changes.map((c) => (
                    <li key={c.item}>
                      {c.item}: {c.from === null ? "novo" : usd(c.from)} → <b>{usd(c.to)}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted">Nenhum preço mudou desde o último envio.</div>
              )}
              {result.unresolved.length > 0 && (
                <div className="text-warn">Sem custo identificado (preencha à mão): {result.unresolved.join(", ")}</div>
              )}
            </div>
          )}
          {history && history.imports.length > 0 && (
            <p className="mt-3 text-[11px] text-faint">
              Último envio: {new Date(history.imports[0].at).toLocaleString("pt-BR")} ({history.imports[0].file}) ·{" "}
              {history.orders} pedidos com custo exato no total.
            </p>
          )}
        </div>
        <div>
          <span className="mb-1.5 block text-xs text-zinc-300">Custo do produto por unidade</span>
          <div className="space-y-2">
            {costs.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  id={`cost-product-${i}`}
                  className="input min-w-0 flex-1"
                  placeholder="Nome do produto (ou parte dele)"
                  value={row.product}
                  onChange={(e) => setCosts(costs.map((r, j) => (j === i ? { ...r, product: e.target.value } : r)))}
                />
                <input
                  id={`cost-value-${i}`}
                  className="input w-24"
                  placeholder="0.00"
                  inputMode="decimal"
                  value={row.cost}
                  onChange={(e) => setCosts(costs.map((r, j) => (j === i ? { ...r, cost: e.target.value } : r)))}
                />
                <button
                  type="button"
                  aria-label="Remover produto"
                  className="btn-ghost px-2.5"
                  onClick={() => setCosts(costs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-info hover:underline" onClick={() => setCosts([...costs, { product: "", cost: "" }])}>
            + Adicionar produto
          </button>
          <span className="mt-1 block text-[11px] text-faint">
            O nome precisa estar contido no título do produto na Shopify. Se a Shopify tiver custo por item cadastrado, ele tem prioridade.
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {numField("shippingFirstItem", "Frete: primeiro item", "Cobrado pela Wiio por pedido.")}
          {numField("shippingExtraItem", "Frete: cada item adicional", "Somado ao primeiro item.")}
        </div>
      </div>

      <h2 className="h-section">Pagamento e tráfego</h2>
      <div className="card card-pad space-y-5">
        {numField("paymentFeePercent", "Taxa do gateway (%)", "Shopify Payments no plano Basic: 2,9%.")}
        {numField("paymentFeeFixed", "Taxa fixa por pedido", "Shopify Payments: $0,30.")}
        {numField("defaultCogsPercent", "Custo padrão (% do preço)", "Usado só para produtos sem custo cadastrado.")}
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">Fonte do custo de tráfego</span>
          <select
            id="set-spendSource"
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
          <input id="set-currency" className="input" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} />
        </label>
      </div>

      <button onClick={save} className="btn-primary mt-5">
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
    </div>
  );
}
