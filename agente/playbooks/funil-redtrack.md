# Funil com RedTrack (substitui funil-clickflare)

Regra: **dinheiro vem do CRM** (Shopify + custos Wiio + taxas + reembolsos); **funil e tracking vêm do RedTrack**.

## Caminho do clique
Fonte (Taboola / Revcontent / Outbrain / MediaGo) → link de tracking da **campanha do RedTrack** (`rtCampaigns[].url`)
→ lander/advertorial → oferta (produto na Shopify) → checkout → compra → upsell (ex.: OmniPro → hearingKIT).

## Uma campanha do RedTrack por produto + fonte + país
- Nome no RedTrack: `[PRODUTO] [FONTE] [PAÍS]` — ex. `[OMNIPRO] [TABOOLA] [US]`.
- Várias campanhas da fonte alimentam a mesma campanha do RedTrack.
- O CRM liga campanha da fonte ↔ campanha do RedTrack nesta ordem: ligação manual → id do RedTrack no link do anúncio
  → nomenclatura (produto + fonte + país) → código/nome. Campanha sem ligação aparece como "sem vendas ligadas".

## Contagem
- O RedTrack conta **1 compra por venda e +1 por upsell**. A Shopify conta pedidos. Ao comparar: `compras RT ≈ pedidos + upsells`.
- Campo de compra: o CRM escolhe automaticamente (`total_purchases` primeiro, depois `purchases`, `conversions`…).
- **IC (InitiateCheckout):** um dos `convtype1…40`; o CRM detecta sozinho (ou o gestor fixa em Configurações).
- Gasto: o CRM usa o gasto da **API da fonte**; o gasto do RedTrack só entra para fonte sem API (MediaGo).

## Diagnóstico pelo funil (a calibrar na fase 3)
| Sintoma | Onde olhar | Leitura provável |
|---|---|---|
| CTR bom, IC baixo | lander | lander não entrega a promessa do anúncio |
| IC bom, compra baixa | oferta / checkout | preço, frete, confiança, checkout com erro |
| Compras RT ≫ pedidos Shopify | tracking | postback duplicado — **não mexer sem o gestor** |
| Pedidos Shopify ≫ compras RT | tracking / UTM | venda sem UTM (ver "Vendas sem UTM" no Dashboard) |
| Custo por IC acima de {{custo_IC_vencedoras × fator}} | campanha | candidata a corte (ver `sentinela.md`) |

## O que ainda falta no CRM
Relatório do RedTrack por **lander, oferta e anúncio** (hoje só por campanha) — ver `crm-mapeamento.md`.
