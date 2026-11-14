# Anstrex Native playbook (v0.1, 2026-11-14)

## Acesso
- native.anstrex.com/listing (login em app.anstrex.com/login; credencial no cofre do bot, id omitido neste repo público).
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
