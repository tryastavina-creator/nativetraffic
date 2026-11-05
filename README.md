# nativetraffic — painel operacional

Painel que cruza **Shopify** (pedidos/receita/COGS/reembolsos) com o **custo das fontes de tráfego**
(MediaGo, Outbrain, Taboola, MGID, Google Ads, Meta), o **RedTrack** (atribuição) e o processador de
pedidos **WIO** — tudo conectado por uma tela de **Integrações**, incluindo qualquer **servidor MCP**.

Sem nenhuma integração conectada, o painel roda em **modo demonstração** com dados fictícios.

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha ENCRYPTION_KEY (openssl rand -hex 32)
npm run dev                  # http://localhost:3000
```

## Estrutura

```
src/app/page.tsx                 Dashboard (KPIs, P&L, canais, produtos)
src/app/integrations/page.tsx    Central de integrações (APIs + MCP)
src/app/settings/page.tsx        Taxas, COGS padrão, fonte do custo
src/app/api/…                    metrics · integrations · mcp · settings · webhooks/wio
src/lib/registry.ts              Catálogo de provedores e campos de cada um
src/lib/store.ts                 Credenciais criptografadas (AES-256-GCM) em data/connections.json
src/lib/metrics.ts               Agregação: lucro, ROAS, CPA, por plataforma/produto/dia
src/lib/connectors/              shopify · redtrack · traffic (taboola, outbrain, mediago, mgid, meta, googleads) · wio · mcp
```

Para adicionar uma fonte nova: inclua o provedor em `registry.ts` e um conector em
`connectors/traffic.ts` que devolva `SpendRow[]`. O resto do painel já se adapta.

## Como a atribuição funciona

- **Receita** vem da Shopify. Cada pedido é atribuído a uma plataforma pelo `utm_source` da última visita
  (`customerJourneySummary`). Use `utm_source=taboola|outbrain|mediago|mgid|google|facebook` nas campanhas.
- **Custo** vem da API de cada plataforma. Se uma plataforma não estiver conectada, o custo dela vem do
  RedTrack (ou use RedTrack para tudo em Configurações).
- **Lucro** = receita − ads − COGS (custo da variante na Shopify, ou % padrão) − taxa do processador − reembolsos.

## Shopify: API vs. MCP

São duas coisas diferentes:

| | Para quê | Como conectar aqui |
|---|---|---|
| **Admin API** | O painel puxar pedidos 24/7 | Integrações → Shopify |
| **MCP** (no Claude) | Você conversar com o Claude sobre a loja | claude.ai → Settings → Connectors |
| **MCP remoto** (no painel) | Listar/chamar ferramentas de um MCP pelo painel | Integrações → Adicionar servidor MCP |

Para o painel, use a Admin API:

1. Shopify → **Settings → Apps → Develop apps** (ou o **Dev Dashboard** em dev.shopify.com).
2. Crie um app e dê os escopos `read_orders`, `read_all_orders`, `read_products`, `read_inventory`, `read_customers`.
3. Instale na loja e copie o **Admin API access token** (`shpat_…`) — ou o **Client ID + Secret**.
4. Em Integrações → Shopify, informe `sualoja.myshopify.com` + token e clique em **Conectar**.

## WIO

O conector é configurável (base URL, endpoint de pedidos, API key). Cadastre na WIO o webhook
`https://<seu-dominio>/api/webhooks/wio` para receber pedidos, reembolsos e chargebacks (assinatura HMAC-SHA256
no header `x-wio-signature`). Ajuste `src/lib/connectors/wio.ts` conforme a documentação da sua conta.

## Deploy

O armazenamento padrão usa o disco (`data/`). Em hosts serverless (Vercel), troque `src/lib/store.ts` por um
banco (Postgres/Supabase) — a interface é pequena (`listConnections`, `saveConnection`, `deleteConnection`, settings).
