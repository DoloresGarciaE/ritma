#!/usr/bin/env node
/*
 * contrast.js — calculadora de contraste WCAG 2.1 para la paleta de Ritma.
 *
 * Regla operativa (Especificación de color §6): cualquier combinación nueva se
 * verifica con este script ANTES de usarse en la UI. Ningún par de colores entra
 * al producto sin pasar el umbral que le corresponde.
 *
 * Uso:
 *   node tools/contrast.js "#5A4BD1" "#FFFFFF"   # ratio + veredicto AA/AAA
 *   node tools/contrast.js --check               # valida los ratios de las specs
 *
 * Fórmula: WCAG 2.1 relative luminance + contrast ratio.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

"use strict";

/** "#RRGGBB" | "RRGGBB" -> { r, g, b } en 0..255 */
function hexToRgb(hex) {
  const m = String(hex)
    .trim()
    .replace(/^#/, "")
    .match(/^([0-9a-fA-F]{6})$/);
  if (!m) throw new Error(`Hex inválido: ${hex} (esperado #RRGGBB)`);
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

/** Luminancia relativa WCAG 2.1 de un color sRGB. */
function relativeLuminance({ r, g, b }) {
  const lin = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio de contraste (1..21) entre dos colores; el orden no importa. */
function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Veredicto WCAG por umbral: texto normal (4.5 AA / 7 AAA) y grande / UI (3 AA / 4.5 AAA). */
function verdict(ratio) {
  return {
    normalAA: ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
    uiComponent: ratio >= 3,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/*
 * Pares documentados en Marca §6.3 y Color §6, con su ratio publicado.
 * Sirven de test de regresión: si el cálculo se aleja del valor de la spec,
 * o hay un bug acá o la spec quedó desalineada — en ambos casos se investiga,
 * no se ignora.
 */
const SPEC_PAIRS = [
  { label: "Tinta 900 / blanco", a: "#23212F", b: "#FFFFFF", expected: 15.79 },
  { label: "Tinta 900 / Neutro 50", a: "#23212F", b: "#FBFAF7", expected: 15.13 },
  { label: "Violeta 600 / blanco", a: "#5A4BD1", b: "#FFFFFF", expected: 6.25 },
  { label: "Violeta 700 / blanco", a: "#4A3DB8", b: "#FFFFFF", expected: 7.92 },
  { label: "Violeta 400 / blanco (anillo de foco)", a: "#7263E2", b: "#FFFFFF", expected: 4.57 },
  { label: "Coral 500 / blanco", a: "#EE6A4D", b: "#FFFFFF", expected: 3.09 },
  { label: "Coral 700 / blanco", a: "#C24327", b: "#FFFFFF", expected: 5.09 },
  { label: "Verde 700 / blanco", a: "#177449", b: "#FFFFFF", expected: 5.78 },
  { label: "Ámbar 800 / blanco", a: "#8F5300", b: "#FFFFFF", expected: 6.17 },
  { label: "Rojo 600 / blanco", a: "#CC4141", b: "#FFFFFF", expected: 4.77 },
  { label: "Gris 600 / blanco", a: "#625F55", b: "#FFFFFF", expected: 6.39 },
  { label: "Gris 600 / Neutro 50", a: "#625F55", b: "#FBFAF7", expected: 6.12 },
  { label: "Violeta 300 / Tinta oscura", a: "#8B7FF0", b: "#17161D", expected: 5.47 },
  { label: "Coral 300 / Tinta oscura", a: "#F59B85", b: "#17161D", expected: 8.48 },
  { label: "Coral 300 / Superficie oscura", a: "#F59B85", b: "#201F28", expected: 7.69 },
  { label: "Blanco roto / Tinta oscura", a: "#EDECE6", b: "#17161D", expected: 15.18 },
  { label: "Blanco roto / Superficie oscura", a: "#EDECE6", b: "#201F28", expected: 13.77 },
  { label: "Texto secundario oscuro / Tinta oscura", a: "#A5A29A", b: "#17161D", expected: 7.04 },
];

// Tolerancia: las specs redondean a 2 decimales; permitimos un pequeño margen.
const TOLERANCE = 0.05;

function runCheck() {
  let failures = 0;
  for (const p of SPEC_PAIRS) {
    const got = round2(contrastRatio(p.a, p.b));
    const diff = Math.abs(got - p.expected);
    const ok = diff <= TOLERANCE;
    if (!ok) failures++;
    const mark = ok ? "ok  " : "MAL ";
    console.log(
      `${mark} ${p.label.padEnd(38)} calculado ${got.toFixed(2).padStart(6)} · spec ${p.expected
        .toFixed(2)
        .padStart(6)}${ok ? "" : `  (Δ ${diff.toFixed(2)})`}`,
    );
  }
  console.log("");
  if (failures === 0) {
    console.log(`Todos los ${SPEC_PAIRS.length} pares coinciden con las specs (±${TOLERANCE}).`);
    return 0;
  }
  console.log(`${failures} par(es) NO coinciden con las specs. Revisar spec o cálculo.`);
  return 1;
}

function printPair(a, b) {
  const ratio = contrastRatio(a, b);
  const v = verdict(ratio);
  const yn = (bool) => (bool ? "sí" : "no");
  console.log(`${a} sobre ${b}`);
  console.log(`  Ratio: ${ratio.toFixed(2)}:1`);
  console.log(`  Texto normal — AA (≥4.5): ${yn(v.normalAA)} · AAA (≥7): ${yn(v.normalAAA)}`);
  console.log(`  Texto grande / UI — AA (≥3): ${yn(v.largeAA)} · AAA (≥4.5): ${yn(v.largeAAA)}`);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      'Uso:\n  node tools/contrast.js "#5A4BD1" "#FFFFFF"\n  node tools/contrast.js --check',
    );
    return 0;
  }
  if (args[0] === "--check") return runCheck();
  if (args.length >= 2) {
    try {
      printPair(args[0], args[1]);
      return 0;
    } catch (err) {
      console.error(err.message);
      return 1;
    }
  }
  console.error("Faltan argumentos. Pasá dos colores hex, o --check.");
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { hexToRgb, relativeLuminance, contrastRatio, verdict };
