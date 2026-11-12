# Pendências da migração do Logan

## Sem acesso ao kit (`davidloganx/nativetrafficagent`)
O GitHub desta sessão não enxerga o repositório. Quando liberar (colaborador + app do Claude no repo), comparar e completar:
- `modelo/CLAUDE.md` × `agente/CLAUDE.md`
- `modelo/config/*` × `agente/config/*`
- `modelo/playbooks/sentinela.md`, `regras-plataformas.md`, `funil-redtrack.md`, `crm-mapeamento.md`, `rotinas.md` × os de `agente/playbooks/`
- `modelo/historico/aprendizados-gerais.md` → acrescentar em `agente/historico/aprendizados.md`
- `referencia/playbooks/` a adaptar (método, sem números do SpineEase): `escala.md`, `motor.md`, `ciclo-de-vida.md`, `otimizacao.md`,
  `diagnostico-diario.md`, `criativos-padroes.md`, `creator.md`, `autonomia.md`, `checklist-setup.md`. `spy.md` só se houver bot de spy.
  Painel (`dashboard/`, `painel-logan.md`, `monitor.md`): só com pedido do gestor (fase 5).

## Fase 2 — acesso ao CRM (bloqueia a fase 3)
- `NT_AGENT_TOKEN` no Railway + a mesma chave no cofre desta sessão para o domínio do CRM. Sem isso o Logan só lê a Shopify.
- PR proposto (branch separada, gestor aprova): `dryRun` nas rotas de escrita, log de ações do agente, P&L por produto/país/hora,
  RedTrack por lander/oferta/anúncio. Ver `playbooks/crm-mapeamento.md`.

## Fase 3 — aprender o projeto
- Feito: produtos e preços (Shopify), vendas por produto e por semana (30 dias), nomenclatura real.
- Falta (precisa do CRM): vencedores com números, break-even por produto, custo por IC das vencedoras, horários por fonte.

## Fase 4 — perguntas ao gestor
1. Fontes habilitadas para o Logan operar (Taboola? Revcontent? Outbrain/MediaGo só leitura?).
2. Tetos: orçamento diário máximo por campanha e por conta; campanhas novas por dia.
3. Metas: lucro/ROAS mínimo por produto (OmniPro, hearprev, Neuroprev…).
4. Papel de cada produto no funil (front, upsell) e se neuropatia está no ar.
5. Países além dos EUA.
6. Quem opera Google/Meta.
7. Branch de trabalho do CRM para os PRs do Logan (o Railway publica `claude/cool-cori-tak1yt`).
