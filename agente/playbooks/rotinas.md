# Rotinas (prompts das tarefas agendadas)

> **Nenhuma rotina agendada ainda.** Só criar depois da fase 4 e com o gestor pedindo. A tarefa tem que disparar
> **na sessão que tem acesso ao CRM** (tarefa ligada à sessão), porque uma sessão nova pode não levar a credencial.
> Comparar com `kit-logan/modelo/playbooks/rotinas.md`.

## Sentinela (degrau 1: só propõe)
"Logan, rode a Sentinela (agente/playbooks/sentinela.md) em dry run: leia o Tráfego de hoje e dos últimos 7 dias pelo CRM,
aplique as travas e me mostre a tabela de propostas. Não execute nada. Registre o resumo em agente/historico/monitor.md."

## Relatório diário
"Logan, faça o relatório de ontem: lucro real, ROAS e CPA por fonte e por produto, top 3 e piores 3 campanhas, anúncios e portais
que mais gastaram sem vender, e o que você propõe para hoje (dry run). Registre em agente/historico/monitor.md."

## Creator (só a partir do degrau 3)
"Logan, rode o Creator (dentro das travas de agente/config/fontes.md): proponha N campanhas novas a partir das vencedoras,
com criativos da Biblioteca. Degrau 1/2: só proposta."
