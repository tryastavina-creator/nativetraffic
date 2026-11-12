# Nomenclatura (real, deste projeto)

## Padrão atual (gerado pelo CRM)
- **RedTrack:** `[PRODUTO] [FONTE] [PAÍS]` — ex. `[OMNIPRO] [TABOOLA] [US]`.
- **Campanha na fonte:** `[PRODUTO] [DEVICE] [LANCE] [PAÍS] [DATA]` — ex. `[OMNIPRO] [DESKTOP] [MAXCONV] [US] [06.11.26]`.
  - Device: DESKTOP, MOBILE, TABLET, combinações `DESKTOP/TABLET`, ou ALL.
  - Lance: MAXCONV, TCPA, SMARTBID, CPC (Taboola) · CPC, CPA (Revcontent).
  - País: 2 letras; UK é escrito UK (o CRM manda GB para a Taboola).
- O leitor do CRM também entende `[SPINEEASE-STN][DESK/TAB][MAX][UK] 6 Nov` (datas com mês por extenso, tags extras entre país e data).

## Nomes antigos vistos (antes do padrão)
- `014 | Taboola | OmniPro | ADV`, `008 | Revcontent | OmniPro | TESTE AB`, `010 | MediaGo | OmniPro | MOB |` — código numérico na frente; o CRM liga pelo código.
- `CP 02 - PLS - OmniPRO - Desktop`, `REV CEO MVC - SETUP01` — fora do padrão; ligar à mão ("Ligar vendas a…").
- Campanhas de outros produtos/projetos na mesma conta (ex. `Copy of GP05 - CP01 | Desktop [PP]`) → "Ignorar gasto".

## A fazer na fase 3
Listar todas as campanhas ativas e marcar quais estão fora do padrão (dry run de renomeação — renomear só com aprovação).
