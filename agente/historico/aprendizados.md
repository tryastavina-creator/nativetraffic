# Aprendizados

> Começa com o que este projeto já ensinou. Os **aprendizados gerais** do kit (`kit-logan/modelo/historico/aprendizados-gerais.md`:
> fontes, criativos, venda atrasada, escala) entram aqui quando o repositório do kit estiver acessível.

## Operação do CRM e das fontes (até 12/11/2026)
- Taboola: conta de rede não recebe campanha; data de início no fuso da conta; anúncio só edita/pausa em RUNNING/PAUSED;
  headline com ano de nascimento é reprovada. Detalhes em `playbooks/regras-plataformas.md`.
- Revcontent: orçamento mínimo US$50/dia; CPA exige pixel.
- Criativo bonito que não mostra o produto não serve (gestor rejeitou a aquarela). O produto tem que aparecer.
- RedTrack conta 1 compra por venda + 1 por upsell; a Shopify conta pedidos.

## Vendas reais (Shopify, 13/10–12/11/2026)
| Produto | Pedidos | Vendas brutas | Estornos |
|---|---|---|---|
| PrevenMD™ OmniPro | 43 | US$4.839,70 | US$0 |
| PrevenMD™ hearingKIT (upsell) | 8 | US$1.798,50 | **−US$479,60** (≈27% do bruto) |
| Neuroprev / NeuroB / NeuroNad (neuropatia) | **0** | US$0 | — |

- Upsell OmniPro → hearingKIT: ~8 em 43 pedidos (≈19%) neste recorte; o kit concentra os estornos — investigar motivo.
- Neuropatia sem nenhuma venda em 30 dias: campanhas paradas ou ainda não lançadas? Confirmar com o gestor.

## Vendas por semana (Shopify)
| Semana (seg) | Pedidos | Vendas | Ticket médio |
|---|---|---|---|
| 12/10 | 2 | US$495,80 | US$247,90 |
| 19/10 | 4 | US$551,60 | US$137,90 |
| 26/10 | 11 | US$1.554,60 | US$152,23 |
| 02/11 | 25 | US$3.405,90 | US$117,08 |
| 09/11 (até 12/11) | **1** | US$99,90 | US$99,90 |

**Alerta 12/11:** queda de 25 pedidos/semana para 1 nesta semana. Verificar no CRM se as campanhas foram pausadas, se o gasto continua
(gasto sem venda = checar tracking/checkout) ou se é atraso de dados. **Não mexer em tracking/checkout sem o gestor.**
