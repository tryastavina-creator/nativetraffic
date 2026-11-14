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
- Basic search + Translated Text aceita OR numa caixa só: "tinnitus OR hearing" trouxe tinnitus e perda auditiva em vários idiomas.
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
