# Anstrex Native playbook (v0.1, 2026-11-14)

## Acesso
- native.anstrex.com/listing (login em app.anstrex.com/login, credencial no cofre do bot, id omitido neste repo público).
- Cloudflare bloqueia o navegador da nuvem no login; a sessão atual foi aberta pelo usuário na minha tela. Sessão expira à noite: o chat principal reloga e roda a coleta.

## Entrega
- GitHub: tryastavina-creator/nativetraffic, branch spy-inbox (repo PÚBLICO). Canal do agente lido do branch padrão claude/cool-cori-tak1yt (não há main).

## Nichos (prioridade)
1. hearing: hearing loss, tinnitus, hearing aid, ringing ears | DE Hörverlust, Tinnitus, Hörgerät | FR perte auditive, acouphènes | ES pérdida auditiva, acúfenos | PT perda auditiva, zumbido | DA høretab | SV hörselnedsättning | NO hørselstap
2. neuropathy: neuropathy, nerve pain, tingling feet, numbness | DE Neuropathie, Nervenschmerzen | FR neuropathie | ES neuropatía | PT neuropatia | DA/SV/NO neuropati

## Interface (descoberto na 1a rodada)
- Não há caixa de palavra-chave na página: o botão "Search" da barra abre um diálogo com Basic search e Advanced search.
- Basic search: um termo por vez, com rádio: Creative Text, Translated Text, Landing Page URL, Landing Page Domain, Landing Page Text, Publisher Domain, Publisher Widget ID, Creative URL chains.
- Usar Translated Text com termos em inglês cobre anúncios em todos os idiomas.
- Advanced search: query builder com grupos AND/OR, linhas campo/operador/valor; tem "Save your search" / "Load your saved search". Montar 16 linhas na mão é lento e frágil (dropdown rola sozinho; digitar "Creative Title" seleciona "Creative Subtext").
- Sliders no topo: Days Running (0–562), Ad-Strength, Gravity; campo Date Range (vai só até ontem).
- Cards mostram rede, categoria, tecnologia, bandeira de geo e datas; gravidade e dias rodando não aparecem no card. Drawer do anúncio tem abas Synopsis, Statistics, Creatives, Landing Pages, Publishers, Ad Networks, Devices, Geo e "Open in New Tab".
- Se a busca/filtros sumirem: fechar o drawer e diminuir o zoom.
- Árvore de acessibilidade não expõe o diálogo de busca: clicar por coordenadas.

## Como buscar (atualizado em 2026-11-21)
- Escape e rolar até o topo da listagem antes de cada busca nova.
- Clicar **Reset All** primeiro: isso limpa o chip Search, o Date Range, o sort e os sliders.
- O botão azul **Search** ao lado de Reset All abre o diálogo central **BASIC SEARCH**. O chip vazio «Search ✕» **não** abre esse diálogo.
- No diálogo: rádio **Translated Text**, digitar o termo e Enter.
- O campo Date Range é só leitura: mudar as datas pelas setas do calendário, não digitando no input.
- Slider: clicar o número (elemento `.p-inplace-display`), digitar o valor, Enter. Um máximo acima do máximo atual do slider é ignorado — usar Reset All para alargar a faixa antes de subir o teto.
- Domínio da lander: no painel do criativo, na linha imediatamente abaixo de «Bounce Rate:».

## Regras
- Nunca filtrar por geo; geo é só pista. Gravidade julgada dentro de cada rede.
- Limites de escalando: Taboola/MGID/AdsKeeper ≥300, Outbrain ≥150, Revcontent ≥400.
- Nunca comprar, nunca enviar dados pessoais, nunca inventar números.

## Atualização 2026-11-14 (2a tentativa, funcionou)
- Basic search + Translated Text: o operador OR se comporta como AND (confirmado na coleta de neuropathy e na 2ª passagem de hearing). "tinnitus OR hearing" só trouxe anúncios com as duas palavras. Buscar um termo por vez e deduplicar por ad id.
- Gravidade = ícone de foguete no card; Ad-Strength = ícone de gráfico. Statistics tem só gráficos de impressões/rank; Landing Pages lista domínios.
- Dias rodando por anúncio não aparecem em lugar nenhum; só pelo slider Days Running (os limites do slider acompanham o resultado filtrado). Números do slider são editáveis (clicar, digitar, Enter), aplica sozinho.
- Date Range filtra por ÚLTIMA vez visto. Para "visto pela primeira vez nos últimos N dias": Sort = Date First Seen (desc) e cortar pela data do card.
- Sorts: Most Popular (Recent), Most Popular (Overall), Date First Seen asc/desc, Date Last Seen asc/desc, Shortest/Longest Running.
- Lista virtualizada com scroll infinito; Escape fecha o drawer.
- Nome do arquivo da thumbnail traz o site do publisher, não a lander.
- Visões montadas: A Most Popular (Recent); B Most Popular (Overall) + Date Range 30 dias; C sort first seen desc com corte de 7 dias; D Gravity 100–300; E Gravity 300+; F Gravity 0–60 + first seen desc com corte de 14 dias; G Days Running 30+.

## Análise (2026-11-14, nicho hearing)
- A raiz de pgsrc.com e de lphst.com devolve a mesma página branca com o texto "Hostname.one" e meta robots noindex,nofollow. O HTML é o mesmo (a diferença é só o beacon do Cloudflare): sinal de cloaking/white page quando o acesso não vem do clique do anúncio. Oferta, preço e checkout não foram legíveis nesses dois domínios.
- naturegrove24.com devolve 403 (Cloudflare + nginx) no acesso direto, inclusive em /en e /sk. A oferta não foi legível.
- pawer-growls-palps.rest abriu um advertorial completo em indonésio (produto Longvita, pedido COD no próprio domínio).
- adskeeper.co.uk redireciona para o site da rede AdsKeeper; candyai.gg redireciona para candy.ai (oferta não relacionada a audição). O campo lander_domain do Anstrex pode gravar tracker da rede ou uma captura errada — não tratar automaticamente como loja do anunciante.
- Thumbnails com a mesma headline podem ter phash bem diferente (o anunciante testa muitas imagens). Lateralização só com hamming ≤8 ou headline quase idêntica, e mesmo assim cruzar com o que a lander realmente é.
- Dias rodando por anúncio continuam ausentes; usar apenas dias_entre_primeira_e_ultima (last_seen - first_seen), nunca inventar "days running".

## IMPORTANTE (2026-11-14, neuropathy)
- O "OR" da Basic search se comporta como AND: "neuropathy" = 27, "nerve" = 26, "neuropathy OR nerve" = 0. A busca "tinnitus OR hearing" de hearing só pegou anúncios com as DUAS palavras.
- Fazer uma busca por termo e deduplicar por ad id. Termos base: hearing: tinnitus | hearing | "hearing loss" | "hearing aid" | ears; neuropathy: neuropathy | nerve | numbness | tingling | "burning feet".
- Busca, sort e sliders persistem entre buscas; os limites dos sliders voltam ao intervalo do novo resultado. Ajustar mín. e máx. de gravidade em passos separados e conferir.


## Análise (2026-11-14, hearing — 2ª passagem, 100 anúncios)
- A 1ª passagem (48 anúncios) ficou estreita por causa do OR=AND. Buscas soltas em "tinnitus" e "hearing" acrescentaram 52 anúncios, inclusive Revcontent, Taboola, Outbrain, AdsKeeper, AdNow e Popin.
- AdNow e Popin não tinham piso de "escalando" no briefing. Usei o mesmo da Taboola/MGID/AdsKeeper (≥300) e registrei isso nos arquivos.
- naturegrove24.com segue o mais forte na MGID (625 e 351). Na Revcontent, buyhears.com chegou a 40371 (produto Hears, tampões D2C, não aparelho auditivo). Na Taboola, audionovabrasil.com.br (marca AudioNova/Sonova) chegou a 5922. No AdNow, neotex.pro chegou a 4335 (página 522 nesta visita).
- Marcas/varejo (ainda concorrentes, salvo o usuário dizer o contrário): GAES/Amplifon, GEERS/Sonova, AudioNova, Vivason, Audibene, Philips, e bonne-audition.fr (landing da Audibene para o Signia Silk IX). hearclear.com é lead-gen da Marketing VF (MVF).
- wonderbanana.com e chudopolsko.info compartilham imagens (phash 0–2) e a mesma casca JS (`/build/bundle.min.js`); adskeeper.co.uk entra no mesmo cluster de imagem (hamming 6) como tracker.
- hearease.site abriu advertorial do travesseiro Derila Ergo (og:url em dailylifeinsider.com). seravia.info na raiz é um blog de Berlim, sem a oferta do anúncio. vária landers DR devolveram corpo vazio (Cloudflare) ou 403/522.

## Análise (2026-11-14, nicho neuropathy)
- 137 anúncios. Na MGID, a maior gravidade (5847) está gravada em adskeeper.co.uk com a headline alemã "Neuropathie (brennende Füße)? Machen Sie das sofort", a mesma de evidwell.com (1231); evidwell na raiz é um WordPress "Hello world!".
- Cluster de lateralização forte (phash 0) entre myvita.day, green-ri.click, beauty-ri.click, washbosswhale.beauty, solveclocktext.space, linfaflowstore.online e adskeeper.co.uk, mesmo com headlines diferentes (1/2 xícara, "leia antes que apaguem", 2 plantas). Vários desses domínios devolveram HTTP 200 com corpo vazio (cloaking).
- liyng.com escala na Outbrain (até 3487) com "Ständig taube Füße? Nervenschädigung bei Diabetes…", 18 variações desde 2026-11-10; a mesma headline está em wexiy.com (phash mínimo 14, acima de 8). TLS de liyng.com e wexiy.com falhou nesta visita.
- science-actualite.com volumando/escalando na Outbrain (498); a raiz mostrou artigo de pele/nutrientes (noindex) com links para biovancia.com, não a oferta de neuropatia.

## Coleta (2026-11-15)

- Sliders (Days Running, Gravity, Ad-Strength) e o sort persistem entre buscas. Ao trocar o termo, conferir de novo os limites — eles podem herdar o intervalo anterior ou resetar para o novo resultado.
- No painel do criativo, esperar o bloco "Site and Landing Page Information" carregar antes de anotar o domínio da lander (o drawer abre antes desse bloco).
- A busca por Landing Page Domain (visão R nesta coleta) devolve também anúncios de outras categorias no mesmo domínio. Excluir os que estão claramente fora do nicho (ex.: tênis e ar-portátil na AudioNova; próstata/articulação no pgsrc; sapatos na liyng; diabetes/emagrecimento no wellnessgaze; anúncios de farmácia fora do tema no healthweekly; "hold their nerve" em jornal de futebol; cálcio na Amazon). Não usar a gravidade desses anúncios como gravidade do nicho.
- Headlines nativas às vezes trocam letras latinas por cirílicas de aparência igual. Tratar como a mesma headline depois de normalizar.
- NewsMax apareceu no nicho neuropathy (1 anúncio, gravidade 7). Piso de escalando adotado: ≥300, igual Taboola/MGID/AdsKeeper/AdNow/Popin, até haver briefing específico.
- auditorey.co e auditorey.com redirecionam para o mesmo https://www2.auditorey.com.
- integratedsupplementlatam.fun e globallaunch.store devolveram a mesma página padrão da Hostinger (MD5 idêntico) nesta visita.

## Coleta (2026-11-16)
- A rotina da manhã gravou as listagens em pipe e morreu antes do processamento, sem abrir as gavetas (lander_domain em branco na primeira passagem). Mais tarde no mesmo dia o raw foi completado: hearing 86 anúncios com domínio; neuropathy 65 (os 36 iniciais + 29 dos termos nerve/numbness/tingling). Não inventar domínio a partir do publisher no thumbnail nem só por headline parecida — esperar a gaveta.
- O Date Range padrão do Anstrex é os últimos 30 dias, terminando ontem. Isso limita o sort por first-seen: criativos cuja primeira vista cai fora dessa janela não aparecem no topo de “mais novos”. Se a visão C precisar de lançamentos com first-seen mais antigo, alargar o Date Range antes de ordenar. Os sliders e o sort persistem entre buscas — conferir ao trocar o termo.
- Na visão C, a ausência de cartões com first-seen ≥ corte significa que **não houve lançamentos novos daquele termo na janela pedida**, não que a coleta tenha falhado. (Em 16/11, C e F de “hearing” e da primeira passagem de “neuropathy” ficaram vazias por isso; E de neuropathy teve 2 cartões.)
- Hearing: termos tinnitus e hearing (Translated Text). Tinnitus teve as sete visões (E com 3 cartões). B usou Date Range 2026-10-17 a 2026-11-15.
- Neuropathy: neuropathy +, nesta correção, nerve, numbness e tingling (Translated Text). G teve Days Running 30–534 e Gravity 0–520 na primeira passagem.
- NewsMax voltou com volume visível em wellnessgaze.com. Piso de escalando permanece ≥300 até haver briefing específico.

## Coleta (2026-11-17)
- Date Range desta coleta: **2026-10-18 a 2026-11-16** (últimos 30 dias, terminando ontem), aplicado a **todas** as visões. A gravidade e o Ad-Strength do Anstrex são calculados dentro dessa janela. Exemplo medido na hora: em “tinnitus”, o pico foi 277 com a janela e 3185 sem Date Range.
- Nas coletas de 14–16/11 o Date Range de 30 dias (terminando ontem) estava documentado sobretudo na **visão B** (Most Popular Overall). As outras visões (A, C–G) não tinham essa janela aplicada; nelas entraram gravidades bem mais altas (buyhears.com 40371, audionovabrasil.com.br 5922, adskeeper.co.uk em neuropathy 5847, liyng.com 3487). Por isso, variações de gravidade entre 16/11 e 17/11 **podem ser artefato de método**. Não mudar a classe de um player só porque a gravidade caiu nesta coleta. last_seen, first_seen e o aparecimento/retorno de anúncios continuam válidos.
- Padrão daqui para a frente (para a gravidade ser comparável dia a dia): usar **uma janela só, em todas as visões da rodada**. Janela escolhida: últimos 30 dias terminando ontem (Date Range = (hoje−30) .. ontem). Não misturar cartões com e sem range na mesma entrega. Se um dia a busca precisar ficar sem range (para achar um pico “all-time”), anotar isso no raw e **não** sobrescrever a gravidade histórica com o número da outra janela.
- Termos (Translated Text, um por vez): hearing = tinnitus, hearing; neuropathy = neuropathy, nerve, numbness, tingling. Visões A–G em tinnitus, hearing e neuropathy; A, C, D, E em nerve, numbness e tingling; até 15 cartões por visão.
- LockerDome apareceu (1 anúncio, gravidade 0). Piso de escalando adotado: ≥300, igual Taboola/MGID/AdsKeeper/AdNow/Popin/NewsMax, até haver briefing específico.
- Exclusões desta rodada (headline claramente fora do nicho): “Court hearing for man charged…” (wdrbwave.com); “Scientist Calls For Rescue After Hearing This From Inside The Glacier” (tips-and-tricks.co); “Nine-man United hold their nerve” (ballymenanow.co.uk); cálcio na Amazon. Headline genérica com domínio claramente do nicho (ex.: trymodernhearing.com, thenervehealthreport.com) permanece no master.

## Coleta (2026-11-18)
- Date Range desta coleta: **2026-10-19 a 2026-11-17** (últimos 30 dias, terminando ontem), aplicado a **todas** as visões. É o mesmo método da coleta de 17/11 (lá a janela foi 2026-10-18 a 2026-11-16), por isso a gravidade é comparável dia a dia. Exemplo de sanidade no mesmo anúncio: Forscher / gesund-vital-ratgeber.org 277 (17/11) → 258 (18/11) na Outbrain.
- As colunas de rede e geo desta coleta guardam só os badges e bandeiras visíveis no card. Os chips «+N» **não foram expandidos**. Na fusão com o master, redes e geos visíveis entram em união com o histórico; o campo `network` primário de um anúncio já conhecido não é trocado só porque o badge sumiu. Um badge em falta **não** significa que o anúncio saiu da rede ou do geo.
- Picos Outbrain desta coleta muito acima do pico comparável de 17/11 (277): testeauditivo24.pt 1410 e 705 (first_seen 17/11), geers.de 923 (first_seen 12/11), healthmatters24.com 510 (first_seen 17/11); em neuropathy, liyng.com 944 (o mesmo anúncio estava a 712 em 17/11). Estes valores foram registados como coletados e sinalizados como **possível artefato de captura**. Não usar sozinhos como prova de explosão de mercado, nem mudar classe só por eles se o restante da janela não confirmar.
- Rede nova vista nos cards: **Google** (3 anúncios de toprisparmio.com, gravidade 0). Piso de escalando provisório ≥300, como Taboola/MGID/AdsKeeper, até haver briefing em contrário. LockerDome permanece com piso ≥300.
- Fora do nicho excluído nesta passagem: thisiscm.com (vietnamita, hearing); voici.fr (Procès Depardieu / audience); shamanu.co.il (מס הכנסה, imposto); trending-hunt.com (sapatos de inverno «designed for nerve»); endokrino.com (L-Thyroxin e Schilddrüse). Headlines gregas de neuropatia com acento (Νευροπάθεια) passam a ser mantidas.
- 4 landers desta coleta vieram em branco (hearing 5078241225 e 5186932914; neuropathy 5528689380 e 3885389106) e ficaram em branco — não inventar domínio a partir da headline ou do publisher da thumbnail.
- Funis só de players **novos** e relevantes, em leitura: nunca comprar, nunca enviar o formulário.

## Coleta (2026-11-19)
- Date Range **2026-10-20 a 2026-11-18** em todas as visões (mesmo método de 17/11 e 18/11). Ao recarregar a página, o Date Range guardado recuou um dia: conferir e digitar de novo antes de cada visão.
- Slider de gravidade: o máximo acompanha o resultado da janela. Em tinnitus o máximo foi 262, então D (100–300) rodou como 100–262 e E (≥300) ficou vazio. E vazio por esse motivo não é falha de coleta. Usar «Reset All» antes de trocar de termo para não herdar o máximo do termo anterior.
- **A gravidade decai.** Entre 18/11 e 19/11, 79 anúncios se sobrepõem com gravidade ≥20. Desses, 36 caíram para cerca de metade (33 com ad_strength idêntico), 34 ficaram iguais e 9 mudaram de outro jeito. Os picos Outbrain sinalizados em 18/11 seguem esse padrão: testeauditivo24.pt 1410→705 (ad_strength 2820 igual), geers.de 923→476, healthmatters24.com 510→255, liyng.com 944→482. Os números de 18/11 não eram erro de leitura; eram um impulso de um dia que não se sustentou. Regra: um pico isolado só vira «escalando forte» se se repetir na coleta seguinte ou se o ad_strength crescer junto.
- Na conversão, entidades HTML das headlines e categorias (`&amp;`) são desescapadas. Um anúncio sem thumbnail no DOM fica com o campo vazio (hoje 5656277308, endokrino.com, excluído por tireoide).
- Exclusões desta rodada: endokrino.com (10 anúncios Schilddrüse/L-Thyroxin com «Kribbeln») e trending-hunt.com (sapatos). Headlines checas de formigamento/ardor nos pés («mravenčení nohou», «brnění a pálení nohou») passam a ser mantidas no nicho neuropathy.
- Ângulo novo **HEAR-A16 — recrutamento de testers** («Procura-se: 250 pessoas…», «250 Testers gezocht…», «Hansaton sucht 100 Tester…»). Ajustes de regra: «chirurgo/chirurgul» → A6; «סבסוד» (subsídio) → A14; «za 49 Kč» → A4 (preço simbólico); «Neurologen flehen» → NEURO-A11; «nicht Vitamin B» / «nicht an Vitamin» → NEURO-A10; «meia chávena» / «половин чаша» / «μισό φλιτζάνι» → NEURO-A3.
- Funis lidos só na raiz e só de players novos. grazianeidettagli.info tem a mesma casca /build/bundle.min.js de wonderbanana/chudopolsko. giornale-salute.it e deutscher-gesundheits-fachkreis.de têm a mesma casca de loja vazia de gesund-vital-ratgeber.org. digitalpages.co.il mostra uma página de produto italiana sem relação com o anúncio (fachada). Nada foi comprado nem enviado.

## Coleta (2026-11-20)
- Date Range desta coleta: **2026-10-21 a 2026-11-19** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–19/11; a gravidade é comparável.
- **Qualidade dos dados (visões copiadas):** o coletor admitiu, e a inspeção do raw confirmou, que vários blocos não são extrações reais dessa visão:
  - hearing E: 14 de 15 linhas iguais a A|hearing (a 15.ª só troca o id, mesma gravidade 352);
  - hearing C e F: sequência de payloads idêntica, nos termos tinnitus e hearing;
  - neuropathy A: prefixo igual a E|neuropathy + um subconjunto de D|neuropathy;
  - nerve A: exatamente E|nerve seguido de D|nerve; nerve E também copiada.
  Nessas linhas, **não usar a letra da visão** como evidência (lançando via C, volumando via D, escalando via E, novos via F). Gravidade, first_seen e last_seen do ad_id valem. Bloques de numbness/tingling e as demais visões (B, D, G, E|tinnitus, E|neuropathy, C/F neuropathy com 2 ids diferentes, etc.) não mostraram cópia fechada e foram mantidos.
- Hosts de rede/tracker (ex.: adskeeper.co.uk) **não contam como players novos**; ficam no mapa com o tipo `dominio_da_rede_ou_tracker`.
- evidwell.com 1173→587 (mesmo ad_strength 5410) confirma o padrão já visto em 19/11: pico de um dia que não se sustenta quando o strength não acompanha. Já gesund-vital 200→640 veio com subida de ad_strength (5383→7813) — mais credível do que os Outbrain de 18/11.
- Exclusões: superdin.co.il (שימוע = audiência trabalhista, não audição); endokrino.com (Schilddrüse/L-Thyroxin); drvitalex.com (estenose espinal em sueco, sem termo de neuropatia). «tinitom» (eslovaco) passa a ser mantido no nicho hearing.
- Funis só de players novos, em leitura: nunca comprar, nunca enviar o formulário.

## Coleta (2026-11-21)
- Date Range desta coleta: **2026-10-22 a 2026-11-20** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–20/11; a gravidade é comparável.
- **Todas as visões foram extrações reais** (não houve blocos copiados como em 20/11). As letras C/D/E/F voltam a contar como evidência. C e F quase iguais em anúncios novos a gravidade 0 (first_seen 11/20) é o esperado, não uma cópia: em hearing C e F tiveram a mesma sequência de 15 linhas a gravidade 0; em tinnitus C/F houve 14/15 de sobreposição, com 1 id exclusivo em cada lado (gravidades 205 e 45).
- numbness E = 0 anúncios (o máximo do slider de gravidade nesta busca ficou em 150, abaixo do piso 300 da visão E). E vazio por esse motivo não é falha de coleta.
- Passos de busca que funcionaram hoje (também em «Como buscar (atualizado em 2026-11-21)»): Escape e rolar ao topo; **Reset All** primeiro (limpa o chip Search, o Date Range, o sort e os sliders); o botão azul **Search** ao lado de Reset All abre o diálogo central BASIC SEARCH (o chip vazio «Search ✕» não abre); rádio Translated Text, termo + Enter. Date Range é só leitura — usar as setas do calendário. Slider: clicar o número (`.p-inplace-display`), digitar, Enter; um máximo acima do máximo atual do slider é ignorado, então Reset All para alargar. Domínio da lander: na linha imediatamente abaixo de «Bounce Rate:» no painel.
- Hosts de rede/tracker (ex.: adskeeper.co.uk) **não contam como players novos**. Domínios off-niche também não: superdin.co.il (שימוע trabalhista hebraico, não audiologia) e endokrino.com (tireoide). drvitalex.com segue fora (estenose espinal, sem termo de neuropatia).
- gesund-vital-ratgeber.org 250→3320 (ad_strength 872→19400, o mesmo valor em A+D+E+G) foi registado como coletado, mas é um outlier; não usar sozinho como prova de explosão. testeauditivo24.pt 660 (Outbrain, first_seen 11/20) entra no mesmo aviso dos picos de um dia.
- Funis só de players novos, em leitura: nunca comprar, nunca enviar o formulário.

## Coleta (2026-11-22)
- Date Range desta coleta: **2026-10-23 a 2026-11-21** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–21/11; a gravidade é comparável.
- **Todas as visões foram extrações reais.** Os blocos A e C de nerve, numbness e tingling estão no raw (15 anúncios em cada um; o coletor não tinha reportado essas contagens).
- **E incompleta em neuropathy/nerve:** E|neuropathy trouxe 5 cartões, mas A|neuropathy tem 7 ads com gravidade ≥300 (faltam 5398184405 a 374 e 5013132410 a 307). E|nerve trouxe 2 cartões, iguais aos 2 ads ≥300 de A|nerve neste ficheiro. Não usar a ausência em E como evidência contra «escalando via E»; classificar pela gravidade, first_seen e last_seen do ad_id. tingling E (4) bateu com os 4 ads ≥300 de A|tingling.
- numbness E = 0 anúncios (máximo do slider de gravidade nesta busca: 152, abaixo do piso 300). E vazio por esse motivo não é falha de coleta.
- A e E de hearing saíram com a mesma sequência de 15 anúncios, todos ≥369: sobreposição natural da visão 300+ com os mais populares recentes, não cópia. C e F de neuropathy idênticos a gravidade 0 e first_seen 11/21 é o esperado para anúncios novos.
- O Outbrain 3320 de gesund-vital-ratgeber.org (ad 5023457882, de 21/11) **não se repetiu**: o anúncio não está no pull de hoje (last_seen 11/20). O número permanece no histórico e não entra no top desta janela. testeauditivo24.pt apareceu com um pico de um dia a 1290 (first_seen 11/21) — registado como coletado, não prova sozinha de explosão.
- Hosts de rede/tracker (ex.: adskeeper.co.uk) **não contam como players novos**. Domínios off-niche também não: superdin.co.il (שימוע trabalhista) e endokrino.com (tireoide).
- Funis só de players novos, em leitura: nunca comprar, nunca enviar o formulário.

## Coleta (2026-11-23)
- Date Range desta coleta: **2026-10-24 a 2026-11-22** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–22/11; a gravidade é comparável.
- **Todas as visões foram extrações reais.** E bateu com os ads ≥300 de cada termo (tinnitus 6, neuropathy 4, tingling 3, nerve 1, numbness 1). E|hearing foi cortada em 15 de 20: faltaram 2 ads ≥300 que aparecem noutras visões (audibene.de 595 em G, pgsrc.com 314). A ausência em E não é evidência contra escalando. C e F idênticas em hearing (anúncios de 22/11 a gravidade 0) é o esperado.
- **Decaimento confirmado outra vez:** testeauditivo24.pt 1290→645 e 660→330, com ad_strength igual (2580/1320). geers.pl 586→298 (strength 30896→30906). Regra mantida: pico isolado não é escala sem repetição ou sem o strength crescer.
- Filtro de nicho alargado (o filtro antigo excluía anúncios reais): ET «kuulmist» (audição), RO «țiuit în urechi» / «Audiolog», HU «fülzúg» (zumbido). Com isto torvenqila.info (AdsKeeper 419, EE) entrou como player novo.
- Fora do nicho nesta rodada: drvitalex.com (estenose espinal; agora na lista de domínios off-niche), endokrino.com (8), zdraveikrasota.bg (adormecimento da cabeça), adskeeper.co.uk «1 cucchiaino… grasso» (emagrecimento), pgsrc.com «Sumea näkö» (visão), thisiscm.com (vietnamita).
- Thumbnails com prefixo `newsmax_` podem vir com o badge «Revcontent» no card. A rede primária continua a ser a do arquivo do thumbnail, como nas rodadas anteriores.
- medizinbericht.de: a raiz faz meta-refresh para /adv01/ (advertorial), que leva a /vsl01/ (VSL NervenGold em player converteai/vturb). O preço não está no HTML. Nada foi enviado.
- Funis só de players novos, em leitura: nunca comprar, nunca enviar o formulário.

## Coleta (2026-11-24)
- Date Range desta coleta: **2026-10-25 a 2026-11-23** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–23/11; a gravidade é comparável. Todas as visões foram extrações reais (hearing 203 linhas, neuropathy 245).
- E|tinnitus teve só 8 cartões (≥300). E|numbness teve 0 anúncios: o máximo do slider de gravidade era 196, logo nenhum ad ≥300 existia nesse termo. Contagens do dia: neuropathy E 11, nerve D 14, numbness D 4, tingling E 6. Alguns «+N countries» não foram expandidos (geo_hint incompleto). C e F de tinnitus saíram idênticas porque todos os cards novos têm gravidade 0–60.
- Uma headline veio truncada pelo coletor (hearing D, 5675290177, «…κερδίζο&u»); o texto completo aparece nos outros anúncios do mesmo domínio («…κερδίζουν την προσοχή»). Um anúncio (hearing B, 5224603393) veio com thumbnail vazia. Os 89 ids novos tiveram o domínio lido no painel do criativo (0 em branco).
- **Pico de 1.º dia e decaimento, de novo:** gesund-vital-ratgeber.org 3320→602 (strength 19400→20060), amplificadorauditivo.com 635→362, torvenqila.info 419→214 (strength +10). Anúncios de 1 dia vêm com strength = 2× a gravidade (caffeinecommons 642/1284, elreporte 305/610, medizinbericht 315/630); caffeinecommons.com ficou em lançando por ser pico de um dia.
- **Outbrain mexe de anúncio para anúncio:** no liyng.com um anúncio foi 2662→1040 e outro 167→1566 no mesmo dia, com strength subindo. Julgar o player (cluster de anúncios e strength), não o anúncio isolado.
- Snapshots master_2026-11-23/players_2026-11-23 foram copiados do master/players de 23/11 antes da mescla, como em 23/11 (master_2026-11-22/players_2026-11-22).
- Fora do nicho nesta rodada (nenhuma extensão de filtro necessária): pgsrc.com «Sumea näkö» (visão), superdin.co.il «שימוע» (audiência trabalhista), laleggepertutti.it «udienza» (audiência judicial), drvitalex.com (estenose espinal), zdraveikrasota.bg (adormecimento da cabeça), endokrino.com ×7 (tireoide).
- Funis só de players novos, em leitura: silentroomreview.com é página-vídeo com VSL converteai/vturb (produto e preço dentro do vídeo, não legíveis); caffeinecommons.com devolveu 500/corpo vazio. Nada foi enviado.
- Correção de processo: em 23/11 as «Tendências» e «Testes» dos movimentos.md/json saíram letra a letra (lista feita a partir de uma string). Em 24/11 são listas de bullets.

## Coleta (2026-11-25)
- Date Range desta coleta: **2026-10-26 a 2026-11-24** (últimos 30 dias, terminando ontem), em todas as visões. Método igual ao de 17–24/11; a gravidade é comparável. hearing_raw: 14 visões (199 linhas de dados); neuropathy_raw: 19 visões (230 linhas de dados). C = first_seen ≥ 11-18; F = first_seen ≥ 11-11. Os ids são ids de card (DOM), como nos dias anteriores.
- **Duas visões copiadas pelo coletor:** F|neuropathy foi copiada por shell de C|neuropathy (mesmos 15 ids, gravidade 0, first_seen 24/11) e E|nerve das 14 primeiras linhas de A|nerve; o coletor diz que as páginas ao vivo mostravam exatamente esses cartões. Regra aplicada (a mesma de 20/11): ingeri gravidade e datas de cada anúncio, mas **não** somei F (neuropathy) nem E (nerve) ao campo `views`, e as duas visões não contam como evidência de classe. Em hearing, todas as visões foram extrações reais; E|tinnitus teve só 4 cartões.
- E|numbness = 0 anúncios (máximo do slider de gravidade: 203, abaixo do piso 300). Alguns geos ficam incompletos onde o card mostra «+N». C|numbness 9 e D|numbness 2 cartões; os demais blocos de nerve/numbness/tingling A e C estão presentes.
- **Checagem de picos (regra: só conta se repetir e o strength seguir):** liyng 1670→835 (e 1566→783, 1249→625, 1091→546, 1069→535, 1040→520: todos exatamente metade, strength inalterado); solveclocktext 1000→500 (strength igual); caffeinecommons 642 repetiu com o mesmo 642 / strength 1284, última vista ainda 23/11 (não seguiu); testeauditivo24.pt 619 (Taboola 5650512297) e healthmatters24.com 640 (5542617745) não reapareceram no pull (última vista 23/11). healthmatters24 teve um novo pico de 1.º dia (Outbrain 1410, strength 2820 = 2×) que fica sem contar até repetir.
- Hosts de rede/tracker não contam como player: dois anúncios apontam para adskeeper.co.uk (5682659216 e 5683187345). Off-niche (não entram como player): superdin.co.il (שימוע trabalhista hebraico), onemove-shop.com (ciática/dor lombar hebraico), voici.fr («perd ses nerfs»), «10 lire con la spiga» (moedas), endokrino.com (tireoide) e drvitalex.com (estenose espinal).
- Filtro: acrescentei «peckanje u tabanu» e «Fußkribbeln» às palavras de neuropatia (formigamento na planta do pé); sem isso naturenewsdaily.com e medizin-report-aktuell.de seriam descartados.
- Lacuna conhecida: o anúncio hearing 5186932914 (Taboola PL, gravidade 501) está sem lander_domain no master desde 18/11; nada foi inferido a partir do thumbnail (publisher fronda_pl).
- Funis só de players novos, em leitura: naturenewsdaily.com é um blog WordPress genérico (raiz); medizin-report-aktuell.de é «Parked Domain» da Funnelish (404). Nada foi enviado.
- Snapshots master_2026-11-24/players_2026-11-24 foram copiados do master/players de 24/11 antes da mescla. Rotina de busca (Reset All → Search → Translated Text) segue a seção «Como buscar» acima.
