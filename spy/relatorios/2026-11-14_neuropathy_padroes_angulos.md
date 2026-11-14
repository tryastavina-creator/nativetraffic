# Padrões e ângulos — neuropathy

Coleta de 2026-11-14, primeira rodada, 137 anúncios (termos neuropathy, nerve, numbness, tingling). Gravidade julgada dentro de cada rede. AdNow/Popin com piso de escalando ≥300. Nenhum formulário foi enviado.

## Taxonomia

| ID | Ângulo | N | Leitura |
|----|--------|---|---------|
| NEURO-A5 | Pés dormentes + diabetes | 20 | O que escala na Outbrain (liyng.com até 3487, 18 variações em 4 dias). Thumbnail de bota; lander ilegível (TLS). |
| NEURO-A6 | Formigamento, truque simples | 17 | science-actualite.com (Outbrain 498, desde agosto). Raiz desviou para artigo de pele. |
| NEURO-A7 | When the burning won't stop | 16 | wellnessgaze.com na Revcontent, máx. 320 (volumando). |
| NEURO-A1 | Imperativo + pés em chamas | 14 | Maior gravidade MGID (5847 no tracker adskeeper; 1231 em evidwell). Imagem da meia de alumínio. |
| NEURO-A3 | Meia xícara toda manhã | 14 | Mesmo anunciante do A2/A4, vários ccTLDs, phash 0, landers vazias. |
| NEURO-A2 | Leia antes que apaguem | 10 | myvita.day 1584 (CS) e espelhos. Pé inchado. |
| NEURO-A4 | Duas plantas / neurologistas | 7 | washbosswhale 1006, mesmo cluster visual. |
| NEURO-A8 | Pare de comer isto | 7 | Testes PL/outras línguas, muitos em 13–14/11, gravidade 0. |
| NEURO-A9 | O hospital não ensina (JP) | 6 | Popin, tadahitasurakeizoku.click, raiz placeholder. |
| NEURO-A10 | Não é vitamina B | 4 | lifetechadviser, tração baixa. |

## Por que os anúncios mais fortes funcionam

### “Neuropathie (brennende Füße)? Machen Sie das sofort” — MGID 5847 (adskeeper.co.uk) / 1231 (evidwell.com)

- **Gancho:** sintoma específico (pés em chamas) + ordem imediata.
- **Imagem:** um pé envolto em papel-alumínio e o outro nu, no tapete — truque caseiro que para o scroll.
- **Lander:** não legível (tracker da AdsKeeper no registro de 5847; evidwell é WordPress vazio). O encaixe com a oferta fica em aberto.

### liyng.com — “Ständig taube Füße? Nervenschädigung bei Diabetes…” (Outbrain, 3487)

- **Gancho:** dormência crônica + diabetes, promessa de alívio direcionado.
- **Imagem:** bota/tênis de inverno com pele sintética e zíper “FASHION” — parece produto, não dor. Pode ser isca ou a oferta ser um calçado.
- **Lander:** TLS falhou. 18 variações da mesma headline desde 10/11; wexiy.com repete o texto.

### myvita.day — “Ti, kteří trpí neuropatií - přečtěte si to, než to smažou!” (MGID, 1584)

- **Gancho:** escassez/censura (“leia antes que apaguem”).
- **Imagem:** pé inchado e avermelhado sendo pressionado — dor explícita, 55+.
- **Lander:** corpo vazio (cloaking). A mesma imagem roda, com outras headlines, num feixe de domínios (.day, .click, .beauty, .space).

## Três ângulos com mais potencial — headlines e prompts

### 1) NEURO-A1 — Pés em chamas, faça isto já

- Neuropatia (pés em chamas)? Faça isto imediatamente
- Pés que queimam e formigam? Comece agora com esta solução
- Neuropathie (brennende Füße)? Machen Sie das sofort (controle; já escala na MGID)

**Prompt:** Photorealistic documentary photo of an older adult's bare feet on beige carpet, the left foot wrapped in household aluminium foil like a sock, the right foot unwrapped showing natural skin and veins, indoor daylight, no text, no faces  
**Negative:** text, typography, watermark, logo, gore, wounds, cartoon, extra toes, child, studio seamless, brand packaging

### 2) NEURO-A5 — Pés dormentes na diabetes

- Pés sempre dormentes? Alívio para o nervo na diabetes
- Ständig taube Füße? Nervenschädigung bei Diabetes gezielt lindern (controle Outbrain)
- Dormência nos pés por diabetes: o que estão testando agora

**Prompt:** Clean ecommerce product photo of a tan quilted winter ankle boot with grey faux-fur collar, side zipper and black rubber sole, three-quarter view, white background, soft studio light, no logos, no text  
**Negative:** text, typography, watermark, logo, word Fashion, extra zipper, deformed shoe, foot inside the shoe, dirty floor, cartoon

Se a oferta não for um calçado, preferir um prompt de pés de pessoa 60+ com meias e expressão de alívio, sem produto inventado.

### 3) NEURO-A2 / A3 — “Leia antes que apaguem” + ritual da meia xícara

- Quem tem neuropatia precisa ler isto antes que apaguem
- Meia xícara todas as manhãs para o formigamento nos pés
- Ti, kteří trpí neuropatií - přečtěte si to, než to smažou! (controle)

**Prompt:** Photorealistic close-up of an older person's swollen, slightly reddened foot being held and massaged by two hands, bathroom or clinic floor softly blurred, natural light, empathetic medical-documentary tone, 55+, no text  
**Negative:** text, watermark, logo, gore, open wounds, gangrene, cartoon, extra fingers, child, stock-photo watermark, oversaturated

## Funis (somente leitura)

Nenhum formulário enviado. Os quatro destinos principais não entregaram a oferta nesta visita:

- **evidwell.com:** WordPress 'Hello world!'.
- **myvita.day, washbosswhale.beauty, beauty-ri.click, green-ri.click, solveclocktext.space:** HTTP 200 com corpo vazio (cloaking).
- **liyng.com / wexiy.com:** falha de TLS.
- **science-actualite.com:** artigo de pele/Biovancia na raiz (noindex), não a oferta de neuropatia.
- **news360.pro:** 403. **tadahitasurakeizoku.click:** placeholder Xserver. **wellnessgaze.com:** blog lead-gen, produto não visível. **candy.ai:** oferta não relacionada.

## Notas

- Primeira rodada: sem histórico anterior nem diff com ontem.
- Thumbnails em `/workspace/spy/neuropathy/imagens/` (137 arquivos).
