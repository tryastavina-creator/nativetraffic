"use client";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABEL } from "@/lib/registry";
import type { Category, Connection, ProviderDef } from "@/lib/types";

type Data = {
  providers: ProviderDef[];
  mcpTemplate: ProviderDef;
  connections: Connection[];
  storage: { backend: "postgres" | "disk"; production: boolean; unreadable: number };
};
type Editing = { def: ProviderDef; conn?: Connection };

const ORDER: Category[] = ["store", "tracker", "traffic", "payments", "fulfillment"];

export default function Integrations() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = () => fetch("/api/integrations").then((r) => r.json()).then(setData);
  useEffect(() => {
    load();
  }, []);

  const byId = useMemo(() => new Map(data?.connections.map((c) => [c.id, c]) ?? []), [data]);
  const mcpConns = data?.connections.filter((c) => c.provider === "mcp") ?? [];
  const connectedCount = data?.connections.length ?? 0;

  return (
    <div className="mx-auto max-w-[1200px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-muted">
          Conecte loja, fontes de tráfego, tracker, processador de pedidos e servidores MCP. As credenciais são
          criptografadas no servidor e nunca voltam inteiras para o navegador.
          <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">{connectedCount} conectadas</span>
        </p>
      </header>

      {data?.storage.backend === "disk" && data.storage.production && (
        <div className="mt-5 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
          As conexões estão sendo salvas no disco temporário do servidor e somem a cada novo deploy. No Railway, abra o
          serviço do site → Variables → Add Reference → escolha <b>DATABASE_URL</b> do Postgres. Depois conecte as APIs de
          novo.
        </div>
      )}
      {!!data?.storage.unreadable && (
        <div className="mt-5 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
          {data.storage.unreadable} conexão(ões) salvas não puderam ser lidas porque a ENCRYPTION_KEY mudou. Volte a chave
          anterior ou conecte essas APIs de novo.
        </div>
      )}
      {data?.storage.backend === "postgres" && (
        <p className="mt-3 text-xs text-faint">Conexões salvas no banco Postgres: continuam após cada deploy.</p>
      )}

      {ORDER.map((cat) => {
        const list = data?.providers.filter((p) => p.category === cat) ?? [];
        if (!list.length) return null;
        return (
          <section key={cat}>
            <h2 className="h-section">{CATEGORY_LABEL[cat]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <ProviderCard key={p.id} def={p} conn={byId.get(p.id)} onOpen={() => setEditing({ def: p, conn: byId.get(p.id) })} />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <div className="mb-3 mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">{CATEGORY_LABEL.mcp}</h2>
          {data && (
            <button className="btn-ghost" onClick={() => setEditing({ def: data.mcpTemplate })}>
              + Adicionar servidor MCP
            </button>
          )}
        </div>
        {mcpConns.length === 0 ? (
          <div className="card card-pad text-sm text-muted">
            Nenhum servidor MCP. Adicione a URL de qualquer MCP remoto (Streamable HTTP) — por exemplo o MCP da sua
            loja Shopify — e o painel lista e chama as ferramentas dele.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mcpConns.map((c) => (
              <ProviderCard key={c.id} def={{ ...data!.mcpTemplate, name: c.label ?? c.id }} conn={c} onOpen={() => setEditing({ def: data!.mcpTemplate, conn: c })} />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ConnectDrawer
          {...editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function Logo({ def }: { def: ProviderDef }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
      style={{ background: `${def.color}22`, color: def.color }}
    >
      {def.initials}
    </div>
  );
}

function StatusDot({ conn }: { conn?: Connection }) {
  if (!conn) return <span className="text-xs text-faint">Não conectado</span>;
  return conn.lastTestOk ? (
    <span className="flex items-center gap-1.5 text-xs text-accent">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Conectado
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-bad">
      <span className="h-1.5 w-1.5 rounded-full bg-bad" /> Erro
    </span>
  );
}

function ProviderCard({ def, conn, onOpen }: { def: ProviderDef; conn?: Connection; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card card-pad group text-left transition hover:border-zinc-600">
      <div className="flex items-start gap-3">
        <Logo def={def} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{def.name}</span>
            {def.status === "beta" && <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">beta</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{def.description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <StatusDot conn={conn} />
        <span className="text-xs text-faint group-hover:text-zinc-300">{conn ? "Gerenciar" : "Conectar"} →</span>
      </div>
      {conn?.lastTestMessage && (
        <p className={`mt-2 truncate text-[11px] ${conn.lastTestOk ? "text-faint" : "text-bad/80"}`}>{conn.lastTestMessage}</p>
      )}
    </button>
  );
}

function ConnectDrawer({
  def,
  conn,
  onClose,
  onChanged,
}: Editing & { onClose: () => void; onChanged: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(conn?.credentials ?? {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: unknown } | null>(
    conn?.lastTestMessage ? { ok: !!conn.lastTestOk, text: conn.lastTestMessage } : null,
  );
  const [tools, setTools] = useState<{ name: string; description?: string }[] | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conn?.id, provider: def.id, credentials: values }),
    }).then((r) => r.json());
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: r.result.ok, text: r.result.message, details: r.result.details });
    setValues(r.connection.credentials);
    onChanged();
  }

  async function retest() {
    if (!conn) return;
    setBusy(true);
    const r = await fetch("/api/integrations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conn.id }),
    }).then((r) => r.json());
    setBusy(false);
    setMsg({ ok: r.result.ok, text: r.result.message });
    onChanged();
  }

  async function remove() {
    if (!conn || !confirm(`Desconectar ${def.name}?`)) return;
    await fetch(`/api/integrations?id=${encodeURIComponent(conn.id)}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  async function loadTools() {
    if (!conn) return;
    setBusy(true);
    const r = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conn.id }),
    }).then((r) => r.json());
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else setTools(r.tools);
  }

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/wio` : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Logo def={def} />
          <div>
            <div className="font-semibold">{conn?.label ?? def.name}</div>
            <div className="text-xs text-muted">{CATEGORY_LABEL[def.category]}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-muted hover:text-zinc-100" aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">{def.description}</p>
        {def.docsUrl && (
          <a href={def.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-info hover:underline">
            Documentação da API ↗
          </a>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {def.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs text-zinc-300">
                {f.label}
                {f.optional && <span className="text-faint">opcional</span>}
              </span>
              <input
                className="input"
                type={f.type === "password" ? "password" : "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                autoComplete="off"
              />
              {f.help && <span className="mt-1 block text-[11px] text-faint">{f.help}</span>}
            </label>
          ))}

          {def.id === "wio" && (
            <div className="rounded-lg border border-line bg-bg p-3 text-xs">
              <div className="text-zinc-300">URL de webhook (se a Wiio oferecer webhooks)</div>
              <code className="mt-1 block break-all text-accent">{webhookUrl}</code>
              <div className="mt-1 text-faint">Envie eventos de pedido, reembolso e chargeback. Assinatura HMAC-SHA256 no header x-wio-signature.</div>
            </div>
          )}

          {msg && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-accent/30 bg-accent/5 text-accent" : "border-bad/30 bg-bad/5 text-bad"}`}>
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Testando…" : conn ? "Salvar e testar" : "Conectar"}
            </button>
            {conn && (
              <button type="button" disabled={busy} onClick={retest} className="btn-ghost">
                Testar de novo
              </button>
            )}
            {conn && def.id === "mcp" && (
              <button type="button" disabled={busy} onClick={loadTools} className="btn-ghost">
                Ver ferramentas
              </button>
            )}
            {conn && (
              <button type="button" onClick={remove} className="btn ml-auto text-bad hover:bg-bad/10">
                Desconectar
              </button>
            )}
          </div>
        </form>

        {tools && (
          <div className="mt-6">
            <div className="label mb-2">{tools.length} ferramentas</div>
            <ul className="space-y-2">
              {tools.map((t) => (
                <li key={t.name} className="rounded-lg border border-line bg-bg p-3">
                  <code className="text-xs text-accent">{t.name}</code>
                  {t.description && <p className="mt-1 line-clamp-3 text-xs text-muted">{t.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
