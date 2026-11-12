# Regras por plataforma

> Versão montada com o que **já aprendemos operando este CRM**. Comparar e completar com
> `kit-logan/modelo/playbooks/regras-plataformas.md` (Outbrain, Taboola, MediaGo, MGID do projeto antigo) quando houver acesso.

## Taboola (confirmado na prática)
- **Contas de rede** (`…-network`) não recebem campanha: criar sempre na **conta anunciante** dentro da rede.
- **Data de início** é lida no **fuso da conta**; mandar "hoje no fuso da conta" (campanha num grupo antigo herdava início no passado → erro).
- **"Sem limite de gasto"** só para contas elegíveis; conta nova pode recusar → usar limite mensal acima do orçamento diário.
- **Grupo com orçamento compartilhado:** a campanha não leva orçamento próprio. O grupo só é escolhido na criação (não dá para trocar depois).
- **Anúncio só pode ser editado ou pausado quando está RUNNING ou PAUSED.** Em revisão/reprovado: não mexe; criar o anúncio já completo
  (título, imagem, descrição, CTA) de uma vez.
- **Política:** headline com **ano de nascimento** ("Born Between 1935-1975", "Seniors Born 1938–1988") foi **reprovada**. Usar "Seniors", "Over 60", "Hard of Hearing?".
- Evitar no criativo: bandeira/uniforme militar com gráfico na orelha (padrão dos reprovados), texto na imagem, logos, setas.
- Imagem gerada por IA leva a marcação `AI_GENERATED`; imagem de spy/real não leva.
- Título até 150 caracteres na API (padrão da casa: ≤75); descrição até 250.

## Revcontent (confirmado na prática)
- Orçamento diário **mínimo US$50**.
- Otimizar por **CPA exige pixel de conversão**.
- Horário: só horas do dia (não separa por dia da semana).
- Headline até 80 caracteres; descrição até 250; sem botão de CTA.
- Bloqueio é por **id de widget**.

## Outbrain / MediaGo / MGID
- Outbrain: só leitura de gasto no CRM (API Amplify, login limitado por hora — o CRM guarda o token de 30 dias).
- MediaGo: só via RedTrack.
- MGID: conector existe; sem operação.
- Regras de política e de lance: **pendente do kit** e do gestor (fase 4).
