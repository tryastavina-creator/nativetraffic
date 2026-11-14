# Padrões e ângulos — hearing

Coleta de 2026-11-14. Primeira rodada, 48 anúncios únicos (busca Translated Text: "tinnitus OR hearing"). Gravidade julgada dentro de cada rede. Ofertas só entram aqui quando foram lidas na lander; campos desconhecidos ficam em branco.

## Taxonomia

| ID | Ângulo | Anúncios | Por que funciona |
|----|--------|----------|------------------|
| HEAR-A2 | Imperativo direto por sintoma | 8 | A ordem na 2ª pessoa (“você precisa fazer isto se tem perda auditiva ou zumbido”) reconhece o sintoma e esconde o “isto”. A imagem lifestyle 55+ com gotas e overlay anatômico vende um ritual simples e quase spa, não um aparelho. É o único ângulo em escalando (MGID 625 e 351, naturegrove24.com). |
| HEAR-A1 | Autoridade médica + urgência | 28 | “Médico/Læge + pergunta + faça isto já” transfere autoridade e aperta o tempo. A mesma frase roda em francês e dinamarquês. As imagens mudam muito (anatomia, insetos do zumbido, alho, batata), o que sugere que o anunciante escala a headline e testa o visual. Volumando na MGID até 215, com histórico desde junho. |
| HEAR-A4 | Oferta de 1 euro + sintoma | 5 | Tira o risco (“experimente por 1 EUR”). Visual da mesma família do A2, em praia tropical. Na Taboola chegou a gravidade 111–120, mas a última vista foi entre 2026-11-07 e 2026-11-09 (parado nesta rodada). Os cards vieram tagueados como Nutraceuticals. |
| HEAR-A3 | Autoridade de biólogo + faça isto | 7 | Troca o médico por biólogo, o que antecipa um “mecanismo natural”. Imagens mais cruas (pera de borracha, colher de alho, seringa). Pawer chegou a gravidade 92 na MGID e já está parado; lphst parou em agosto. |

## Por que os anúncios mais fortes funcionam

### naturegrove24.com — “Musíš to urobiť, ak máš poruchu sluchu alebo hučanie v ušiach” (MGID, gravidade 625 e 351)

- **Gancho:** imperativo + dois sintomas (perda auditiva ou zumbido), sem preço e sem marca.
- **Emoção:** urgência e reconhecimento (“isso é comigo”), com a imagem suavizando o medo.
- **Imagem:** homem ~60 anos, jardim, olhos fechados, conta-gotas com líquido verde e corte anatômico da orelha. A peça de gravidade 351 é o mesmo enquadramento, recorte um pouco mais fechado (phash distância 12, acima do limite 8 — variação, não cópia idêntica). Há também versão com mulher no jardim (gravidade 162).
- **Lander:** naturegrove24.com bloqueou o acesso direto (403). O encaixe com a lander não pôde ser lido. Os anúncios Taboola do mesmo domínio usam gancho de 1 euro e tag Nutraceuticals, o que é só uma pista de oferta, não uma confirmação.

### pgsrc.com — “Médecin : perte auditive ou acouphènes ? Faites ceci vite” / “Læge: høretab eller tinnitus? Gør dette straks” (MGID, gravidade 215 e 211)

- **Gancho:** autoridade médica + pergunta binária + comando urgente. As duas headlines são tradução quase literal uma da outra.
- **Emoção:** confiança na figura do médico + medo de deixar o zumbido/perda piorar.
- **Imagem:** a peça de gravidade 215 é uma ilustração em corte da orelha (cera, canal, cóclea). A de gravidade 211 é uma metáfora forte do zumbido: perfil de um adulto com um enxame de moscas/abelhas em volta da orelha. Nos testes de novembro entram remédios caseiros (alho no canal, batata nas orelhas).
- **Lander:** white page Hostname.one no acesso direto; oferta não legível. Vários testes recentes estão tagueados como Nutraceuticals.

### pawer-growls-palps.rest — “Ahli Biologi: …” (MGID, gravidade até 92, parado)

- **Gancho:** autoridade de biólogo + “se você tem o sintoma, faça isto”.
- **Emoção:** curiosidade (por que um biólogo?) e esperança de método natural.
- **Imagem:** close da pera de borracha azul no ouvido, ou colher com alho e óleo — visual de “truque caseiro”.
- **Lander:** advertorial Longvita (ver funil abaixo), narrado por um “professor” italiano, pedido COD. O anúncio promete um gesto simples; a lander entrega um suplemento em comprimidos. O encaixe é o clássico de native nutra (curiosidade no ad, história longa na página), mas o produto da lander (pílula) não aparece na thumbnail.

## Três ângulos com mais potencial — headlines e prompts

### 1) HEAR-A2 — Imperativo direto (o que já escala)

Variações de headline (manter o mistério do “isto”; testar PT e as línguas em que o ângulo já roda):

- Você precisa fazer isto se tem perda auditiva ou zumbido
- Se o ouvido zumbe ou a audição caiu, faça isto agora
- Não ignore o zumbido: faça isto antes de pensar no aparelho
- Musíš to urobiť, ak máš poruchu sluchu alebo hučanie v ušiach (já escala; manter como controle)

**Prompt de imagem:** Photorealistic lifestyle photo of a relaxed man in his mid-60s with grey hair and beard, sitting on a beige outdoor sofa in a sunny European garden with hydrangeas and a small pond, eyes closed, applying green herbal oil into his ear with a white glass dropper, a semi-transparent anatomical overlay of the inner ear on the side of his head, natural daylight, shallow depth of field, authentic 55+ health advertorial, 35mm, high detail

**Negative prompt:** text, typography, watermark, logo, extra fingers, deformed ear, missing ear, teenager, child, studio backdrop, cartoon, illustration, 3d render, gore, blood, hearing aid, headphones, earbuds, oversaturated, stock photo watermark, uncanny face, extra limbs

Variação: a mesma cena com uma mulher ~60 anos em jardim com glicínias, jarra pequena de óleo no lugar do conta-gotas (já aparece em criativos ativos deste player).

### 2) HEAR-A1 — Autoridade médica (o que mais testa e já volumando)

Variações:

- Médico: perda auditiva ou zumbido? Faça isto já
- Læge: høretab eller tinnitus? Gør dette straks (já volumando; controle)
- Otorrino: esse zumbido pode parar hoje? Veja isto
- Se o médico falou em aparelho, leia isto antes

**Prompt A (anatomia, estilo da peça de gravidade 215):** Clean flat medical illustration, cross-section of a human ear on a light green background, showing ear canal, yellowish earwax buildup, eardrum, cochlea and inner ear in simple educational textbook style, no people, no text, vector-like clarity

**Negative prompt A:** photorealistic photo, gore, surgery, blood, text, labels, letters, watermark, logo, child’s ear, distorted anatomy, 3d render noise

**Prompt B (metáfora do zumbido, estilo da peça de gravidade 211):** Stylized painted profile of a calm older adult facing left against a deep blue background, a cluster of dark blue flies circling the ear with a soft yellow glow, metaphor for tinnitus, editorial illustration, no text

**Negative prompt B:** photoreal, horror, gore, decaying skin, extra eyes, text, watermark, logo, headphones, hearing aid

**Prompt C (teste de curiosidade que está lançando):** Macro photorealistic close-up of an adult ear, a single peeled garlic clove resting at the entrance of the ear canal, natural skin texture, soft indoor light, no hands, documentary feel

**Negative prompt C:** gore, injury, pus, text, watermark, logo, cartoon, extra ears, child, oversharpened

### 3) HEAR-A4 — Trial de 1 euro (já tirou gravidade na Taboola)

Variações:

- Zumbido ou perda auditiva? Experimente isto por 1 euro
- Ušný šum alebo strata sluchu? Vyskúšajte to za 1 EUR (já usada)
- Barulho no ouvido? Teste por 1 EUR hoje
- Perda auditiva: o teste de 1 euro que está circulando

**Prompt de imagem:** Photorealistic lifestyle photo of a woman in her early 60s with short wavy blonde hair, wearing a white linen shirt, reclining on a rattan lounge chair on a tropical beach with limestone cliffs and turquoise water, eyes closed, applying green drops into her ear with a dropper, semi-transparent anatomical overlay of the inner ear, bright natural sun, calm luxury, 55+ advertorial, no typography

**Negative prompt:** text, price tag, euro sign, typography, watermark, logo, bikini model, teenager, deformed ear, extra fingers, cartoon, hearing aid, oversaturated sky, stock watermark

Não colocar o “1 euro” dentro da imagem: o preço já está na headline.

## Funis (somente leitura)

Nenhum formulário foi enviado e nenhum pedido foi feito.

- **naturegrove24.com:** 403 no acesso direto. Oferta, preço, garantia, plataforma e checkout não legíveis.
- **pgsrc.com e lphst.com:** white page Hostname.one (cloaking). Oferta não legível. Os dois compartilham o mesmo template, o que sugere a mesma plataforma de cloaking, não necessariamente o mesmo anunciante.
- **pawer-growls-palps.rest:** advertorial Longvita, narrador Stefano Tomassini (“professor”), mecanismo de regeneração celular do ouvido, produto em comprimidos, 980000 IDR / 490000 IDR, pagamento COD ao courier, sem prazo de reembolso legível, checkout no próprio domínio. Texto ambientado na Itália com preço e telefone da Indonésia.

## Notas

- Esta é a primeira rodada: não há histórico de gravidade anterior nem diff “desde ontem”.
- `idioma_inferido` veio só da headline; `geo_hint` é a bandeira do Anstrex, só pista.
- Thumbnails baixadas em `/workspace/spy/hearing/imagens/`; o nome de arquivo no Anstrex traz o publisher, não a lander.
