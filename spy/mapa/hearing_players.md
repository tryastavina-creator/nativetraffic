# Mapa de players — hearing

Coleta de 2026-11-14. Primeira rodada: não há diff com ontem.

Só concorrentes. Nenhum domínio próprio foi configurado. Gravidade comparada só dentro da mesma rede. Geo é pista. Sem `lander_url` e sem dias rodando (uso `dias_entre_primeira_e_ultima`).

| Domínio | Status | Anúncios | Headlines | Redes | Max gravidade (rede) | Última vez visto | Nota |
|---------|--------|----------|-----------|-------|----------------------|------------------|------|
| naturegrove24.com | escalando | 12 | 3 | AdsKeeper, Mgid, Taboola | Mgid 625, Taboola 120, AdsKeeper 0 | 2026-11-14 | Único em escalando (MGID 625 e 351). |
| pgsrc.com | volumando | 26 | 2 | AdsKeeper, Mgid | Mgid 215, AdsKeeper 25 | 2026-11-14 | Volumando na MGID (máx. 215); 1 anúncio lançando. Lander com white page. |
| candyai.gg | volumando | 1 | 1 | Mgid | Mgid 240 | 2026-11-14 | Lander redireciona para candy.ai (oferta não relacionada). Captura suspeita. |
| adskeeper.co.uk | testando | 2 | 2 | Mgid | Mgid 94 | 2026-11-12 | Redireciona para o site da rede AdsKeeper (tracker, não loja). |
| pawer-growls-palps.rest | parado | 6 | 1 | Mgid | Mgid 92 | 2026-11-09 | Parado (última vista 2026-11-09). Advertorial Longvita legível. |
| lphst.com | parado | 1 | 1 | Mgid | Mgid 37 | 2026-08-26 | Parado desde 2026-08-26. Mesma white page Hostname.one que pgsrc.com. |

## Por player

### naturegrove24.com — escalando

- Primeira vista nesta coleta: 2026-08-25; última: 2026-11-14.
- 12 anúncios, 3 headlines, redes: AdsKeeper, Mgid, Taboola.
- Movimento dos anúncios: escalando (2), volumando (2), parado (7), testando (1).
- Headlines:
  - Musíš to urobiť, ak máš poruchu sluchu alebo hučanie v ušiach
  - Ušný šum alebo strata sluchu? Vyskúšajte to za 1 EUR
  - Šum v ušiach alebo strata sluchu? Vyskúšajte to za 1 euro
- Domínios ligados no registro: candyai.gg (ver interpretação no JSON; nem toda ligação é lateralização confirmada).
- Funil: Acesso direto a https://naturegrove24.com/ (e www, /en, /sk) devolveu 403 Forbidden (Cloudflare + nginx). /index.html devolveu 404. A oferta não foi legível nesta rodada.

### pgsrc.com — volumando

- Primeira vista nesta coleta: 2026-06-10; última: 2026-11-14.
- 26 anúncios, 2 headlines, redes: AdsKeeper, Mgid.
- Movimento dos anúncios: testando (3), volumando (6), parado (16), lancando (1).
- Headlines:
  - Læge: høretab eller tinnitus? Gør dette straks
  - Médecin : perte auditive ou acouphènes ? Faites ceci vite
- Domínios ligados no registro: adskeeper.co.uk (ver interpretação no JSON; nem toda ligação é lateralização confirmada).
- Funil: A raiz devolveu uma página branca com o texto 'Hostname.one', uma imagem SVG embutida e meta robots noindex,nofollow. Sem links, formulários ou oferta visível. HTML quase idêntico ao de lphst.com (diferença só no beacon do Cloudflare). Sinal clássico de cloaking/white page para tráfego que não vem do clique.

### candyai.gg — volumando

- Primeira vista nesta coleta: 2026-08-27; última: 2026-11-14.
- 1 anúncios, 1 headlines, redes: Mgid.
- Movimento dos anúncios: volumando (1).
- Headlines:
  - Musíš to urobiť, ak máš poruchu sluchu alebo hučanie v ušiach
- Domínios ligados no registro: naturegrove24.com (ver interpretação no JSON; nem toda ligação é lateralização confirmada).
- Funil: https://candyai.gg/ redireciona (301) para https://candy.ai/, um site de companhia/chat com IA, sem relação com audição ou zumbido.
- Flag: `lander_suspeita_ou_captura_errada`.

### adskeeper.co.uk — testando

- Primeira vista nesta coleta: 2026-06-11; última: 2026-11-12.
- 2 anúncios, 2 headlines, redes: Mgid.
- Movimento dos anúncios: testando (1), parado (1).
- Headlines:
  - Læge: høretab eller tinnitus? Gør dette straks
  - Médecin : perte auditive ou acouphènes ? Faites ceci vite
- Domínios ligados no registro: pgsrc.com (ver interpretação no JSON; nem toda ligação é lateralização confirmada).
- Funil: https://adskeeper.co.uk/ redireciona (302) para https://www.adskeeper.com/, o site institucional da rede AdsKeeper.
- Flag: `dominio_da_rede_ou_tracker`.

### pawer-growls-palps.rest — parado

- Primeira vista nesta coleta: 2026-10-19; última: 2026-11-09.
- 6 anúncios, 1 headlines, redes: Mgid.
- Movimento dos anúncios: parado (6).
- Headlines:
  - Ahli Biologi: Jika Anda Mengalami Gangguan Pendengaran atau Tinitus, Lakukan Ini!
- Funil: Nesta visita direta a página completa abriu (HTTP 200), sem white page. Há desalinhamento de geo no texto: a história e a oferta 'só na Itália' convivem com idioma indonésio, preço em IDR e exemplo de telefone +62.

### lphst.com — parado

- Primeira vista nesta coleta: 2026-04-21; última: 2026-08-26.
- 1 anúncios, 1 headlines, redes: Mgid.
- Movimento dos anúncios: parado (1).
- Headlines:
  - Bioloog: Als je last hebt van gehoorverlies of tinnitus, doe dit!
- Funil: Mesma white page 'Hostname.one' (noindex) observada em pgsrc.com, HTML estruturalmente idêntico. Oferta não legível. Isso indica a mesma plataforma de cloaking/hospedagem, não prova por si só que é o mesmo anunciante.

## Lateralização

- **pgsrc.com e adskeeper.co.uk:** duas pares de thumbnails com phash hamming 0 (imagens idênticas) e headlines que são tradução uma da outra (médico FR / médico DA). adskeeper.co.uk, porém, abre o site da rede AdsKeeper. Interpretação: tracker ou captura do Anstrex, não um segundo domínio de oferta.
- **naturegrove24.com e candyai.gg:** headline eslovaca exatamente igual. Imagens não similares (distância mínima de phash = 20, acima de 8). candyai.gg cai em candy.ai, oferta de chat com IA. Não dá para afirmar o mesmo anunciante rodando dois domínios de hearing; a lander provavelmente está errada no Anstrex.
- **pgsrc.com e lphst.com:** mesma white page Hostname.one (HTML quase idêntico). Isso aponta para a mesma plataforma de cloaking/hospedagem, não para a mesma imagem ou headline. As headlines são de ângulos diferentes (médico vs. biólogo) e o phash mínimo entre os criativos desta coleta é 22.
- **pawer-growls-palps.rest e lphst.com:** mesmo ângulo de autoridade de biólogo (indonésio vs. neerlandês), mas imagens diferentes (phash mínimo 26). Pode ser cópia do ângulo ou a mesma rede de ofertas em praças distintas; não há evidência de imagem ou headline quase idêntica para cravar o mesmo anunciante.
- Variações da mesma headline no mesmo domínio (naturegrove, pgsrc, pawer) são testes de imagem do próprio player, não lateralização.

