/**
 * brand.mjs — heurísticas de marca para la migración: colores (hex/rgb → OKLCH) y fuentes (CSS → fontsource).
 *
 * Node >= 22, ESM, cero dependencias.
 *
 * - parseColor(str) → '#rrggbb' o null (acepta #rgb, #rrggbb, rgb(), rgba()).
 * - hexToOklch(hex) → {L (0–100), C, H (0–360), css: 'oklch(L% C H)'}.
 * - isNeutral(hex) → true si chroma < 0.03 (blancos, negros y grises).
 * - extractCssColors(css, {limit}) → [{hex, count}] ordenados por frecuencia, sin neutros.
 * - extractCssFonts(css) → {display: family|null, body: family|null} (h1/h2 → display; body/p/html → body).
 * - fontsourcePackage(family) → '@fontsource-variable/<slug>' | '@fontsource/<slug>' | null.
 *
 * Lista de familias conocidas verificada contra el registro npm el 2026-10-08 (fontsource 5.3.x):
 * todas tienen paquete variable salvo Lato, Poppins, Bebas Neue y Anton (solo estático).
 */

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)/gi;

function clamp255(n) {
  return Math.max(0, Math.min(255, Number(n)));
}

function toHex2(n) {
  return clamp255(n).toString(16).padStart(2, '0');
}

/**
 * Normaliza un color CSS a `#rrggbb` minúsculas. Palabras clave (red, white…) → null.
 * @param {string} str
 * @returns {string|null}
 */
export function parseColor(str) {
  const s = String(str ?? '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return `#${h}`;
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(s);
  if (m) return `#${toHex2(m[1])}${toHex2(m[2])}${toHex2(m[3])}`;
  return null;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * sRGB → linear → OKLab → OKLCH (Björn Ottosson, 2020).
 * @param {string} hex '#rrggbb' o '#rgb'
 * @returns {{L: number, C: number, H: number, css: string}} L en 0–100, H en grados.
 */
export function hexToOklch(hex) {
  const norm = parseColor(hex);
  if (!norm) throw new Error(`Color inválido: ${hex}`);
  const r = srgbToLinear(parseInt(norm.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(norm.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(norm.slice(5, 7), 16));

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.sqrt(a * a + bb * bb);
  let H = C < 1e-4 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  const L100 = Math.min(100, Math.max(0, L * 100));
  const css = `oklch(${L100.toFixed(1)}% ${C.toFixed(3)} ${Math.round(H) % 360})`;
  return { L: L100, C, H, css };
}

/**
 * Blanco, negro o gris: chroma < 0.03. Los casi-blancos (L > 95) y casi-negros (L < 25) con un leve tinte
 * (p. ej. los grises azulados de Tailwind, chroma ≈ 0.032) también se consideran neutros.
 */
export function isNeutral(hex) {
  const { L, C } = hexToOklch(hex);
  if (C < 0.03) return true;
  return (L > 95 || L < 25) && C < 0.05;
}

/**
 * Colores más frecuentes en un CSS (hex y rgb/rgba), excluyendo neutros.
 * @param {string} css
 * @param {{limit?: number}} [opts]
 * @returns {{hex: string, count: number}[]}
 */
export function extractCssColors(css, { limit = 3 } = {}) {
  const counts = new Map();
  const text = String(css ?? '');
  for (const re of [HEX_RE, RGB_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const hex = parseColor(m[0]);
      if (!hex) continue;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([hex]) => !isNeutral(hex))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([hex, count]) => ({ hex, count }));
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica neue', 'helvetica', 'arial', 'times new roman',
]);

const DISPLAY_SELECTOR_RE = /(^|[\s,>+~])h[12](?![\w-])/i;
const BODY_SELECTOR_RE = /(^|[\s,>+~])(body|html|p)(?![\w-])|^:root$/i;

/** Primera familia no genérica de una declaración `font-family`. */
function firstFamily(value) {
  for (const part of String(value).split(',')) {
    const fam = part.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    if (!fam || fam.startsWith('var(')) continue;
    if (GENERIC_FAMILIES.has(fam.toLowerCase())) continue;
    return fam;
  }
  return null;
}

/**
 * Familias declaradas en `font-family` para títulos (h1/h2) y cuerpo (body/html/p).
 * Devuelve la más repetida por rol; `null` si no hay declaración utilizable.
 * @param {string} css
 * @returns {{display: string|null, body: string|null}}
 */
export function extractCssFonts(css) {
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const display = new Map();
  const body = new Map();
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(text))) {
    const selector = m[1].trim();
    const decl = /font-family\s*:\s*([^;]+)/i.exec(m[2]) ?? /\bfont\s*:\s*[^;]*?\d[\w%./]*\s+([^;]+)/i.exec(m[2]);
    if (!decl) continue;
    const fam = firstFamily(decl[1]);
    if (!fam) continue;
    const selectors = selector.split(',').map((s) => s.trim());
    if (selectors.some((s) => DISPLAY_SELECTOR_RE.test(` ${s}`))) display.set(fam, (display.get(fam) ?? 0) + 1);
    if (selectors.some((s) => BODY_SELECTOR_RE.test(` ${s}`) || s === ':root')) body.set(fam, (body.get(fam) ?? 0) + 1);
  }
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { display: top(display), body: top(body) };
}

/**
 * Familias conocidas → slug de fontsource. `variable: false` → solo existe `@fontsource/<slug>`.
 * Verificado con `npm view` el 2026-10-08.
 */
export const KNOWN_FONTS = [
  { family: 'Inter', slug: 'inter', variable: true },
  { family: 'Roboto', slug: 'roboto', variable: true },
  { family: 'Open Sans', slug: 'open-sans', variable: true },
  { family: 'Lato', slug: 'lato', variable: false },
  { family: 'Montserrat', slug: 'montserrat', variable: true },
  { family: 'Poppins', slug: 'poppins', variable: false },
  { family: 'Raleway', slug: 'raleway', variable: true },
  { family: 'Playfair Display', slug: 'playfair-display', variable: true },
  { family: 'Fraunces', slug: 'fraunces', variable: true },
  { family: 'Newsreader', slug: 'newsreader', variable: true },
  { family: 'Public Sans', slug: 'public-sans', variable: true },
  { family: 'Source Sans 3', slug: 'source-sans-3', variable: true },
  { family: 'Nunito', slug: 'nunito', variable: true },
  { family: 'Work Sans', slug: 'work-sans', variable: true },
  { family: 'DM Sans', slug: 'dm-sans', variable: true },
  { family: 'Manrope', slug: 'manrope', variable: true },
  { family: 'Outfit', slug: 'outfit', variable: true },
  { family: 'Space Grotesk', slug: 'space-grotesk', variable: true },
  { family: 'Lora', slug: 'lora', variable: true },
  { family: 'Merriweather', slug: 'merriweather', variable: true },
  { family: 'Libre Baskerville', slug: 'libre-baskerville', variable: true },
  { family: 'EB Garamond', slug: 'eb-garamond', variable: true },
  { family: 'Cormorant', slug: 'cormorant', variable: true },
  { family: 'Crimson Pro', slug: 'crimson-pro', variable: true },
  { family: 'Literata', slug: 'literata', variable: true },
  { family: 'Figtree', slug: 'figtree', variable: true },
  { family: 'Plus Jakarta Sans', slug: 'plus-jakarta-sans', variable: true },
  { family: 'Rubik', slug: 'rubik', variable: true },
  { family: 'Karla', slug: 'karla', variable: true },
  { family: 'Archivo', slug: 'archivo', variable: true },
  { family: 'Instrument Sans', slug: 'instrument-sans', variable: true },
  { family: 'Onest', slug: 'onest', variable: true },
  { family: 'Geist', slug: 'geist', variable: true },
  { family: 'Josefin Sans', slug: 'josefin-sans', variable: true },
  { family: 'Oswald', slug: 'oswald', variable: true },
  { family: 'Bebas Neue', slug: 'bebas-neue', variable: false },
  { family: 'Anton', slug: 'anton', variable: false },
  { family: 'Syne', slug: 'syne', variable: true },
  { family: 'Sora', slug: 'sora', variable: true },
  { family: 'Urbanist', slug: 'urbanist', variable: true },
];

const KNOWN_BY_KEY = new Map(KNOWN_FONTS.map((f) => [f.family.toLowerCase().replace(/\s+/g, ' '), f]));

/**
 * Entrada de la lista conocida para una familia (insensible a mayúsculas/espacios) o null.
 * @param {string} family
 */
export function knownFont(family) {
  return KNOWN_BY_KEY.get(String(family ?? '').trim().toLowerCase().replace(/\s+/g, ' ')) ?? null;
}

/**
 * Paquete fontsource recomendado: variable si existe, estático si no, null si la familia no es conocida.
 * @param {string} family
 * @returns {string|null}
 */
export function fontsourcePackage(family) {
  const k = knownFont(family);
  if (!k) return null;
  return k.variable ? `@fontsource-variable/${k.slug}` : `@fontsource/${k.slug}`;
}
