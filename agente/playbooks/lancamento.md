# Lançamento de campanha (setup com RedTrack + CRM)

> Reescreve `lancamento.md` / `checklist-setup.md` do kit para este projeto. **Só com aprovação do gestor.**

## Antes
1. Campanha do RedTrack existe para `[PRODUTO] [FONTE] [PAÍS]` e tem link de tracking (aba Tráfego → Criar campanha → Link mostra a sugerida).
2. Lander e oferta testadas (clique de teste chega no RedTrack com IC e compra de teste).
3. Criativos: 4–6, produto visível, sem texto na imagem, headline com qualificador na frente (≤75), descrição (≤150). Ver `criativos.md`.
4. Modelo: escolher uma campanha vencedora em "Campanha modelo" (copia SpendGuard, regras de conversão, brand safety, horário, rastreio).

## Setup (Taboola)
- Conta: **anunciante** (nunca a rede). Grupo: o do produto, ou novo (orçamento por campanha ou compartilhado).
- Lance: Max Conversions para começar (salvo regra do gestor). Orçamento diário: {{gestor}}. Limite de gasto: nenhum ou mensal acima do diário.
- Início: vazio = agora (fuso da conta). Horário: sempre ligado até termos dados por hora.
- Rastreio: `utm_source=taboola&utm_medium=referral` (ou o da campanha modelo).
- Blocklist: herdar do modelo + listas salvas.
- Subir **pausada**; revisar na Taboola; ativar.

## Setup (Revcontent)
- Orçamento ≥ US$50/dia; CPA só com pixel; bloqueios por id de widget.

## Depois (primeiras 48 h)
- Conferir no CRM: campanha aparece em Tráfego com status, gasto, cliques; vendas ligadas (sem "sem vendas ligadas").
- Anúncios: aprovação na aba Criativos da campanha (em revisão/reprovado com motivo).
- Registrar em `historico/creator.md`.
