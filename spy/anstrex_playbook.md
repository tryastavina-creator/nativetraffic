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
