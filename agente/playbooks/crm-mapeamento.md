# CRM × funções do Logan

O CRM (este repositório, Next.js no Railway) **não é servidor MCP**: `/api/mcp` só repassa chamadas para servidores MCP
externos. O Logan acessa o CRM pela **API HTTP** com `Authorization: Bearer <NT_AGENT_TOKEN>` (vale só para `/api/*`;
as telas continuam com login). Base: `https://<domínio do CRM no Railway>`.

Períodos: `preset=today|yesterday|7d|14d|30d|month` ou `preset=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
Contas: id de conexão, ou `conexão::conta-anunciante` para contas dentro de uma rede Taboola.

## Ler
| Função | Rota real | Observações |
|---|---|---|
| P&L real por dia (receita, gasto, lucro com COGS, frete, taxas, reembolsos) | `GET /api/metrics?preset=…` → `kpis`, `daily`, `platforms` | por fonte: `platforms`; **por produto e por país: falta** (só por campanha via naming); **por hora: falta** |
| Campanhas ativas com métricas (gasto, IC, vendas, upsells, ROAS, lucro, orçamento, status) | `GET /api/traffic?view=tree&preset=…` | árvore fonte → conta → campanha; só campanhas das APIs |
| Campanhas do RedTrack com gasto/vendas ligados | `GET /api/traffic?preset=…` → `rows` (visão RedTrack) e `apiRows` | inclui IC (InitiateCheckout) quando configurado |
| Métricas por anúncio de uma campanha | `GET /api/campaigns/insights?kind=ads&accountId=…&campaignId=…&preset=…` | gasto, cliques, CTR, CPC, conversões da fonte, CPA da fonte, status de aprovação |
| Métricas por portal/site (Taboola) ou widget (Revcontent) | `GET /api/campaigns/insights?kind=sites&…` | inclui bloqueados |
| Criativos por imagem / headline / combo com lucro real | `GET /api/creatives?preset=…` | `images`, `headlines`, `combos`, `products`, `variants` (biblioteca), `savedHeadlines` |
| Configuração e anúncios de uma campanha | `GET /api/campaigns/detail?accountId=…&campaignId=…` | setup completo (orçamento, horário, segmentação) |
| Campanhas vencedoras (modelo para nova) | `GET /api/campaigns/winners?platform=taboola\|revcontent` | top 30 dias por lucro |
| Contas, grupos, campanhas RedTrack (com link), pixels | `GET /api/campaigns/meta` · `GET /api/campaigns/meta?platform=…&accountId=…` | `rtCampaigns[].url` = link de tracking |
| Histórico do que foi criado pelo CRM | `GET /api/campaigns/meta` → `log` | com falhas por criativo |
| Vendas e funil da loja | `GET /api/metrics` → `funnel`, `upsell`, `untracked` · MCP Shopify | funil completo depende da permissão de relatórios da Shopify |
| Custos Wiio (cobertura, média aprendida) | `GET /api/supplier` | `model.coveredTo` = custos exatos até |
| Esteira de produtos | `GET /api/esteira` | — |

## Escrever (sempre dry run antes; só com aprovação)
| Função | Rota real | Dry run nativo? |
|---|---|---|
| Pausar/ativar campanha | `POST /api/campaigns/status {accountId, campaignId, active}` | **não** |
| Pausar/ativar anúncio | `POST /api/campaigns/insights {kind:"ad", accountId, campaignId, id, on}` | **não** |
| Mudar orçamento diário (campanha) | `POST /api/campaigns/insights {kind:"budget", accountId, campaignId, daily}` | **não** |
| Mudar orçamento do grupo (Taboola) | `POST /api/campaigns/insights {kind:"groupBudget", accountId, id, daily}` | **não** |
| Bloquear/desbloquear portal | `POST /api/campaigns/insights {kind:"site", accountId, campaignId, id, on}` | **não** |
| Criar campanha | `POST /api/campaigns/run {action:"create", …}` | valida antes (não cria se inválido), mas não simula |
| Duplicar / copiar para outra conta ou fonte | `POST /api/campaigns/run {action:"copy", …}` | **não** |
| Editar campanha e anúncios (título, descrição, CTA, ativo) | `POST /api/campaigns/run {action:"update", …}` | **não** |
| Subir anúncio em campanha existente | `POST /api/campaigns/run {action:"add", …}` | **não** |
| Ignorar gasto de campanha (outro produto) | `POST /api/traffic/exclude` | — |
| Ligar campanha da fonte à do RedTrack | `POST /api/traffic/link` | — |

## Criativos
| Função | Rota real |
|---|---|
| Banco de imagens/headlines (biblioteca) | `GET/POST/PATCH/DELETE /api/creatives/library` |
| Variações agressivas dos vencedores (IA) | `POST /api/creatives/winners {preset, product, winners, perWinner, model}` |
| Variações de uma imagem específica | `POST /api/creatives/variants` |
| Descrição por nicho | `POST /api/creatives/describe` |

## RedTrack
| Função | Onde | Estado |
|---|---|---|
| Relatório por campanha (gasto, cliques, IC, compras) | dentro do CRM (`/api/traffic` visão RedTrack) | ok |
| Relatório por **lander, oferta e anúncio** | — | **falta** |
| URL de tracking da campanha | `GET /api/campaigns/meta?platform=…&accountId=…` → `rtCampaigns[].url` | ok |
| Criar campanha/oferta no RedTrack | — | **falta** |

## O que falta (proposta de PR, para o gestor aprovar)
1. **Ativar o acesso do agente:** variável `NT_AGENT_TOKEN` no Railway + a mesma chave salva no cofre desta sessão para o domínio do CRM.
   Sem isso o Logan só lê a Shopify. *(Alternativa sem passo do gestor: não existe — a chave tem que existir dos dois lados.)*
2. **`dryRun: true` nas rotas de escrita** — devolve exatamente o que seria enviado à fonte, sem enviar. Necessário para o degrau 1.
3. **Log de ações do agente** (quem, quando, antes/depois, resultado) — base para a Sentinela e para desfazer.
4. **P&L por produto, país e hora** em `/api/metrics`.
5. **RedTrack por lander/oferta/anúncio** e criação de campanha/oferta.
6. (Opcional) **Servidor MCP do CRM** expondo estas rotas como ferramentas — deixaria o Logan chamar o CRM pelo nome, como no projeto original.
