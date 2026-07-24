// scripts/overlay-templates.js
//
// Composição determinística de texto sobre foto, com aspecto "desenhado".
// Cada template é um layout SVG de marca (paleta editorial quente + tipografia
// Cormorant Garamond / Mulish) que é rasterizado por @resvg/resvg-js sobre a
// foto escolhida. Usado pelo queue.js no passo de composição.
//
// API:
//   composeOverlay({ photoBase64, overlay, contentType }) -> { data, mime, width, height }
//   overlay = { headline, kicker?, subline?, cta?, template?, placement? }

import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { Jimp, JimpMime } from "jimp";

const FONT_DIR = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
const FONT_FILES = [
  FONT_DIR + "CormorantGaramond-SemiBold.ttf",
  FONT_DIR + "Mulish-Regular.ttf",
  FONT_DIR + "Mulish-SemiBold.ttf"
];

// Paleta editorial (sobre foto). Deliberadamente ≠ teal da app.
const CREAM = "#F7F1E7";
const GOLD = "#C9A24B";
const INK = "#241B12";
const SERIF = "Cormorant Garamond";
const SANS = "Mulish";

// Catálogo de templates. `default` cobre qualquer contentType sem template próprio.
const TEMPLATES = {
  "story-hero":    { w: 1080, h: 1920, side: 88, bottomAnchor: 1560, align: "start", headlineSize: 104 },
  "story-quote":   { w: 1080, h: 1920, side: 120, center: true, align: "middle", headlineSize: 96 },
  "reel-cover":    { w: 1080, h: 1920, side: 88, topAnchor: 300, align: "start", headlineSize: 100 },
  "post-portrait": { w: 1080, h: 1350, side: 92, bottomAnchor: 1240, align: "start", headlineSize: 88 },
  "post-square":   { w: 1080, h: 1080, side: 88, bottomAnchor: 980, align: "start", headlineSize: 82 },
  "default":       { w: 1080, h: 1350, side: 92, bottomAnchor: 1240, align: "start", headlineSize: 88 }
};

function templateFor(name, contentType) {
  if (name && TEMPLATES[name]) return { name, ...TEMPLATES[name] };
  const byType = {
    story: "story-hero", reel: "reel-cover", post: "post-portrait", carrossel: "post-portrait"
  };
  const fallback = byType[contentType] || "default";
  return { name: fallback, ...TEMPLATES[fallback] };
}

function escXml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Quebra de linha gulosa por largura estimada (sem métricas exactas — chega
// para headlines curtos). `factor` = largura média do glifo / tamanho da fonte.
function wrapText(text, maxWidth, fontSize, factor) {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * factor)));
  const words = String(text || "").trim().split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// Constrói as "linhas" a desenhar (cada uma com fonte/tamanho/cor/altura).
function buildRows(overlay, tpl, textWidth) {
  const rows = [];
  if (overlay.kicker) {
    const size = 30;
    rows.push({ text: overlay.kicker.toUpperCase(), size, lh: size * 1.7, family: SANS, weight: 600, color: GOLD, ls: size * 0.18 });
  }
  const hSize = tpl.headlineSize;
  for (const line of wrapText(overlay.headline, textWidth, hSize, 0.46)) {
    rows.push({ text: line, size: hSize, lh: hSize * 1.06, family: SERIF, weight: 600, color: CREAM, ls: 0 });
  }
  if (overlay.subline) {
    const size = 40;
    for (const line of wrapText(overlay.subline, textWidth, size, 0.52)) {
      rows.push({ text: line, size, lh: size * 1.42, family: SANS, weight: 400, color: CREAM, ls: 0, marginTop: 14 });
    }
  }
  if (overlay.cta) {
    const size = 27;
    rows.push({ text: overlay.cta, size, lh: size * 1.7, family: SANS, weight: 600, color: GOLD, ls: size * 0.05, marginTop: 20 });
  }
  return rows;
}

function textElements(rows, tpl, textWidth) {
  const totalH = rows.reduce((s, r) => s + r.lh + (r.marginTop || 0), 0);
  let top;
  if (tpl.center) top = (tpl.h - totalH) / 2;
  else if (tpl.topAnchor != null) top = tpl.topAnchor;
  else top = (tpl.bottomAnchor ?? tpl.h - 120) - totalH;

  const x = tpl.align === "middle" ? tpl.w / 2 : tpl.side;
  let y = top;
  const out = [];
  for (const r of rows) {
    y += (r.marginTop || 0);
    const baseline = y + r.size * 0.8;
    out.push(
      `<text x="${x.toFixed(0)}" y="${baseline.toFixed(0)}" ` +
      `font-family="${r.family}" font-weight="${r.weight}" font-size="${r.size}" ` +
      `fill="${r.color}" text-anchor="${tpl.align}" ` +
      `letter-spacing="${(r.ls || 0).toFixed(2)}" ` +
      `style="paint-order:stroke;">${escXml(r.text)}</text>`
    );
    y += r.lh;
  }
  return { svg: out.join("\n"), top, bottom: y };
}

function buildSvg(photoBase64, mime, overlay, tpl) {
  const { w, h } = tpl;
  const textWidth = tpl.align === "middle" ? w - tpl.side * 2 : w - tpl.side * 2;

  const rows = buildRows(overlay, tpl, textWidth);
  const { svg: textSvg, top } = textElements(rows, tpl, textWidth);

  // Scrim: gradiente quente do lado do texto para legibilidade.
  let scrim;
  if (tpl.center) {
    scrim = `<rect x="0" y="0" width="${w}" height="${h}" fill="${INK}" fill-opacity="0.42"/>`;
  } else if (tpl.topAnchor != null) {
    scrim = `<rect x="0" y="0" width="${w}" height="${h * 0.6}" fill="url(#scrimTop)"/>`;
  } else {
    const scrimTop = Math.max(0, top - 120);
    scrim = `<rect x="0" y="${scrimTop.toFixed(0)}" width="${w}" height="${(h - scrimTop).toFixed(0)}" fill="url(#scrimBottom)"/>`;
  }

  // Assinatura discreta (wordmark) + fio dourado, no rodapé seguro.
  const markY = tpl.center ? h - 90 : Math.min(h - 70, (tpl.bottomAnchor ?? h - 120) + 120);
  const markX = tpl.align === "middle" ? w / 2 : tpl.side;
  const wordmark =
    `<text x="${markX}" y="${markY}" font-family="${SANS}" font-weight="600" font-size="22" ` +
    `fill="${CREAM}" fill-opacity="0.9" text-anchor="${tpl.align}" letter-spacing="4">PÁTEO DAS LARANJEIRAS</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="scrimBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="0.55" stop-color="${INK}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" xlink:href="data:${mime};base64,${photoBase64}"/>
  ${scrim}
  ${textSvg}
  ${wordmark}
</svg>`;
}

// Compõe a foto (base64) com a estrutura `overlay` e devolve JPEG base64.
export async function composeOverlay({ photoBase64, mime = "image/jpeg", overlay, contentType }) {
  if (!overlay || !overlay.headline) {
    throw new Error("composeOverlay: overlay.headline em falta.");
  }
  const tpl = templateFor(overlay.template, contentType);
  const svg = buildSvg(photoBase64, mime, overlay, tpl);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: tpl.w },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: SANS }
  });
  const png = resvg.render().asPng();

  // PNG → JPEG (consistente com a colecção `images`, mais leve).
  const img = await Jimp.read(png);
  const jpeg = await img.getBuffer(JimpMime.jpeg, { quality: 86 });
  return { data: jpeg.toString("base64"), mime: "image/jpeg", width: tpl.w, height: tpl.h };
}

export { templateFor, TEMPLATES };
