# Fontes de tráfego

Estado no CRM (aba Integrações). Habilitação e tetos: **definidos pelo gestor na fase 4**.

| Fonte | Integração no CRM | Lê | Escreve (só com aprovação) | Contas conhecidas |
|---|---|---|---|---|
| Taboola | API (Backstage) | gasto, campanhas, anúncios, portais | criar/duplicar/editar campanha, grupo, anúncio, pausar, orçamento, bloquear portal | `GPBL Marketing - Conta 01 - SC` (rede `gpblmarketing-network`), `JVPS - 1 - SC` (rede `jvps-br-network`) |
| Revcontent | API (Stats API) | gasto, campanhas, anúncios, widgets | criar/duplicar/editar, pausar, orçamento (mín. US$50/dia), bloquear widget | 1 conta |
| Outbrain | API Amplify (beta) | gasto | — | conectada (token de 30 dias guardado) |
| MediaGo | só RedTrack | gasto e cliques pelo RedTrack | — | — |
| MGID, Google Ads, Meta | conectores existem no CRM | gasto (se conectados) | — | a confirmar |

## Tetos e metas (preencher na fase 4)
- Orçamento diário máximo por campanha: {{gestor}}
- Orçamento diário máximo por conta/fonte: {{gestor}}
- Campanhas novas por dia (Creator): {{gestor}}
- Meta de lucro/ROAS por produto: {{gestor}}
- Quem opera Google/Meta: {{gestor}}

Regras do que pode e não pode em cada fonte: `playbooks/regras-plataformas.md`.
