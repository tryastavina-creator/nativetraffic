# Sentinela — travas de corte e de orçamento

> Método genérico; os valores `{{…}}` são calibrados na fase 3 com os números reais (custo por IC das vencedoras,
> break-even por produto). Comparar com `kit-logan/modelo/playbooks/sentinela.md` e `referencia/playbooks/sentinela.md` §2.0.

**Degrau atual: 1 (dry run).** A Sentinela só **propõe**. Nos degraus 2+ (com o gestor autorizando) ela executa dentro das travas e avisa.

## 1. O que ela olha (a cada execução)
Fonte: `GET /api/traffic?view=tree&preset=today` e `preset=7d`; por anúncio/portal: `GET /api/campaigns/insights`.
Para cada campanha ativa: gasto hoje, gasto 7d, vendas reais, ROAS real, lucro real, IC, custo por IC, % do orçamento usado.

## 2. Travas de corte (propor pausa / −30% de orçamento)
| Situação | Ação proposta | Valor |
|---|---|---|
| Gasto sem nenhuma venda e sem IC acima de X | pausar campanha | X = {{1,5 × CPA alvo do produto}} |
| Custo por IC acima de Y com amostra mínima | −30% de orçamento | Y = {{custo por IC das vencedoras × 2}}; amostra ≥ {{N cliques}} |
| ROAS real 3 dias abaixo do break-even | −30% de orçamento | break-even em `config/produtos.md` |
| Anúncio com gasto > CPA alvo e 0 conversão da fonte | pausar anúncio (se RUNNING/PAUSED) | — |
| Portal com gasto > CPA alvo e 0 conversão | bloquear portal na campanha | — |

**Venda atrasa:** nunca cortar só pelo dia de hoje antes de {{hora EST}}; olhar sempre 3 dias e 7 dias juntos.
**Nunca:** cortar campanha com menos de {{24 h}} no ar, ou com lucro positivo nos últimos 7 dias.

## 3. Travas de orçamento (escala)
- Subir no máximo {{+20–30%}} por vez, e só com ROAS real ≥ {{break-even + margem}} em 3 dias.
- Teto por campanha e por conta: `config/fontes.md` (definido pelo gestor).

## 4. Formato da proposta (dry run)
| Ação | Fonte · conta · campanha | Motivo (números) | Impacto esperado | Como desfazer |
|---|---|---|---|---|

Depois de aprovado e executado, registrar em `historico/otimizacoes.md` (data, ação, antes/depois).
