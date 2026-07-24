// web/content-taxonomy.js
//
// Fonte única da taxonomia de conteúdo do Páteo Content Studio, partilhada
// pelo formulário (app.js monta os dropdowns dependentes a partir daqui).
//
// - PLATFORMS: cada plataforma tem um rótulo, os tipos de conteúdo que
//   suporta, e o `type` grosso do agente (social/blog/ota/other) para onde
//   mapeia. A plataforma escolhida MANDA sobre a inferência do dispatcher.
// - Os `value` de plataforma e de tipo são o que fica guardado no pedido
//   (campos `platform` e `contentType`).

export const PLATFORMS = [
  {
    value: "instagram",
    label: "Instagram",
    type: "social",
    contentTypes: [
      { value: "post", label: "Post" },
      { value: "story", label: "Story" },
      { value: "reel", label: "Reel" },
      { value: "carrossel", label: "Carrossel" },
      { value: "legenda", label: "Legenda (para foto que já tem)" }
    ]
  },
  {
    value: "facebook",
    label: "Facebook",
    type: "social",
    contentTypes: [
      { value: "post", label: "Post" },
      { value: "legenda", label: "Legenda (para foto que já tem)" }
    ]
  },
  {
    value: "airbnb",
    label: "Airbnb",
    type: "ota",
    contentTypes: [
      { value: "listing", label: "Descrição da listagem" },
      { value: "room", label: "Descrição por quarto" },
      { value: "message", label: "Mensagem / resposta" }
    ]
  },
  {
    value: "booking",
    label: "Booking",
    type: "ota",
    contentTypes: [
      { value: "listing", label: "Descrição da listagem" },
      { value: "room", label: "Descrição por quarto" }
    ]
  },
  {
    value: "blog",
    label: "Blog / Site",
    type: "blog",
    contentTypes: [
      { value: "article", label: "Artigo" },
      { value: "page", label: "Página" }
    ]
  },
  {
    value: "newsletter",
    label: "Newsletter / Email",
    type: "other",
    contentTypes: [
      { value: "newsletter", label: "Newsletter" },
      { value: "outreach", label: "Email de outreach (quintas)" }
    ]
  }
];

// Conjuntos de tipos de conteúdo que aceitam uma imagem composta (foto do
// banco, opcionalmente com texto por cima). Para os restantes, a foto "como
// está" continua a poder ser usada, mas o overlay de texto não se aplica.
export const OVERLAY_CONTENT_TYPES = new Set(["story", "post", "reel", "carrossel"]);

export function platformByValue(value) {
  return PLATFORMS.find((p) => p.value === value) || null;
}

export function contentTypesFor(platformValue) {
  const p = platformByValue(platformValue);
  return p ? p.contentTypes : [];
}

export function typeForPlatform(platformValue) {
  const p = platformByValue(platformValue);
  return p ? p.type : null;
}

export function labelForContentType(platformValue, contentTypeValue) {
  const list = contentTypesFor(platformValue);
  const ct = list.find((c) => c.value === contentTypeValue);
  return ct ? ct.label : contentTypeValue;
}
