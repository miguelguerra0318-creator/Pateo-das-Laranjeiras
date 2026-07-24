# Formatos e Templates — Páteo das Laranjeiras

> Manual de conteúdo por **plataforma / tipo de conteúdo** para o Copywriter e o OTA-Editor,
> mais o catálogo de **templates de imagem** e a **estrutura do overlay** (texto composto sobre
> foto). Lido também pelo Editor/QA para validar.
>
> **Regra 0 — base adaptável:** isto é um ponto de partida, não um molde rígido. Lê o `briefText`
> e adapta ângulo, registo, comprimento e template ao contexto concreto. O que **nunca** se
> adapta são as regras inegociáveis (não-venue, "você", sem preços, factos por `rooms.md`/
> `rules.md`, um ângulo por peça).

---

## Princípios (todas as peças)

1. **Vender o momento, não a cama** — "a manhã antes do 'sim'" (`concept.md`). A foto é a prova; o texto acrescenta emoção OU um benefício claro, nunca descreve o óbvio.
2. **Um ângulo por peça** (`segments.md`). Nunca misturar "casa/história" com "flexibilidade" com "Pack" na mesma peça.
3. **Vigilância "não venue"** no corpo E no texto sobre a imagem: *"O dia começa aqui"* ✅ / *"Casem aqui"* ❌.
4. **Hashtags:** 3–6 das famílias de `segments.md`, alinhadas ao ângulo + localização. Nunca inventadas, nunca 20+.
5. CTA sempre email; nunca preços; "você"; "Zona A/B" só interno.

---

## Manuais por tipo de conteúdo (`contentType`)

O texto que vai **na imagem** (`overlay`) é sempre **destilado à parte** do `body` — nunca o mesmo blob.

- **story** — *hook* que pára o dedo. `overlay.headline` 3–7 palavras, carga emocional/convite; `overlay.subline` ≤8 palavras; `overlay.cta` opcional (curto). O `body` é 1–2 frases de contexto/legenda para quem partilha.
- **post** — primeira linha forte; `body` = 2–4 parágrafos curtos (um ângulo) + CTA email; hashtags em `notes`. Se levar imagem com texto, `overlay.headline` 4–8 palavras.
- **reel** — `overlay.headline` = gancho de 3–6 palavras (capa); `body` = 1ª linha-gancho + sugestão de 3–5 textos de ecrã (beats); hashtags em `notes`.
- **carrossel** — `overlay.headline` = promessa da capa; `body` = os slides, um por linha começando por "Slide N:" (slide 1 gancho, meio valor, último CTA email).
- **legenda** — para foto que a sócia já tem: `body` = 2–4 parágrafos + CTA + hashtags em `notes`. Sem overlay.
- **listing** (OTA) — título orientado a benefício + secções escaneáveis (espaço, quartos, localização, pequeno-almoço/Pack). Factual por `rooms.md`. Preços "sob consulta".
- **room** (OTA) — descrição factual por quarto: cama, tamanho, carácter, WC privativo. Sem "Zona A/B".
- **article / page** (blog) — texto longo, SEO natural, tom da casa.
- **newsletter** — assunto ≤50 caracteres (em `title`) + corpo curto + 1 CTA.
- **outreach** — email B2B às quintas: *"ofereça aos seus noivos alojamento à altura, a minutos do seu espaço"*.

---

## Estrutura `overlay` (só quando `photo.mode == "with-text"`)

Quando a sócia escolheu uma foto para levar texto por cima, o especialista produz, **por output**, além do `body`:

```json
"overlay": {
  "kicker": "linha curta de contexto (opcional), ex.: 'A manhã do grande dia'",
  "headline": "o gancho — poucas palavras, é a estrela",
  "subline": "apoio de uma linha (opcional)",
  "cta": "info.pateodaslaranjeiras@gmail.com (opcional)",
  "template": "story-hero | story-quote | reel-cover | post-portrait | post-square (opcional)",
  "placement": "bottom (opcional)"
},
"photoMode": "with-text",
"photoRef": "<driveFileId da foto escolhida>"
```

- **headline** é obrigatório no overlay; kicker/subline/cta são opcionais.
- Se `template` for omitido, o motor escolhe pelo `contentType` (story→story-hero, reel→reel-cover, post/carrossel→post-portrait).
- Para `photo.mode == "as-is"` (foto tal-qual): **não** produzir `overlay`; basta `photoMode: "as-is"` e `photoRef`. O motor usa a foto sem texto.
- Sem foto escolhida: não produzir `overlay`/`photoMode`/`photoRef` — segue o fluxo normal do Art Director.

---

## Catálogo de templates (imagem)

Paleta editorial quente (creme, tinta quente, dourado) + Cormorant Garamond (headline) e Mulish (kicker/subline/CTA). Definidos em `scripts/overlay-templates.js`.

| Template | Formato | Uso |
|---|---|---|
| `story-hero` | 1080×1920 | Story emotiva / preparativos (flagship). Texto no terço inferior. |
| `story-quote` | 1080×1920 | Frase evocativa única, centrada. |
| `reel-cover` | 1080×1920 | Capa/thumbnail de reel, gancho em cima. |
| `post-portrait` | 1080×1350 | Post de feed (4:5). |
| `post-square` | 1080×1080 | Post quadrado. |

Os textos do overlay respeitam as **mesmas regras** (não-venue, "você", sem preços). O headline de uma story é a montra da marca — trata-o como tal.
