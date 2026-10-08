#!/usr/bin/env node
/**
 * tokens-to-theme.mjs — DTCG 2025.10 (.tokens.json) -> bloque `@theme` de Tailwind v4.
 *
 * Uso:
 *   node tokens-to-theme.mjs <tokens.json> <global.css>            escribe el bloque
 *   node tokens-to-theme.mjs <tokens.json> <global.css> --check    solo valida (no escribe)
 *   node tokens-to-theme.mjs <tokens.json> --dry-run               imprime el bloque por stdout
 *
 * Reemplaza SOLO lo que haya entre `/* tokens:start *\/` y `/* tokens:end *\/` en el CSS
 * destino (los marcadores se conservan). Idempotente: dos ejecuciones = mismo archivo.
 * Node >= 22, ESM, cero dependencias. Sale con código 1 y mensaje claro ante JSON
 * inválido, alias sin resolver, ciclos, tipos desconocidos o marcadores ausentes.
 *
 * Convenciones del kit (detalle en references/tokens-dtcg.md):
 *  - Namespace Tailwind = nombre del grupo raíz (`color`, `font`, `text`, `spacing`, `radius`,
 *    `shadow`, `ease`, `duration`, `leading`, `tracking`, `container`…) salvo que el grupo
 *    declare `$extensions["kit.namespace"]` (p. ej. un grupo `semantic` -> `color`).
 *  - Un segmento `DEFAULT` se omite: `spacing.DEFAULT` -> `--spacing`.
 *  - Modos: `$extensions["kit.modes"] = { light: <valor>, dark: <valor> }` en un token de
 *    color genera `--x-light`, `--x-dark` y `--x: light-dark(var(--x-light), var(--x-dark))`.
 *    Si falta `light`, se usa `$value`. `$extensions["kit.dark"] = <valor>` es un atajo.
 *  - `$extensions["kit.fluid"] = { min, max, viewport:[minPx, maxPx] }` en una dimension
 *    genera `clamp()` fluido (la pendiente se calcula aquí).
 *  - Tipos soportados: color, dimension, fontFamily, fontWeight, number, duration,
 *    cubicBezier, shadow (objeto o array de objetos DTCG).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const START = '/* tokens:start */';
const END = '/* tokens:end */';
const REF_RE = /^\{([^}]+)\}$/;

function fail(msg) {
  console.error(`tokens-to-theme: ERROR — ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const check = args.includes('--check');
const unknownFlag = args.find((a) => a.startsWith('--') && !['--dry-run', '--check'].includes(a));
if (unknownFlag) fail(`flag desconocido ${unknownFlag}. Flags válidos: --check, --dry-run`);
const [tokensPath, cssPath] = args.filter((a) => !a.startsWith('--'));
if (!tokensPath || (!cssPath && !dryRun)) {
  fail('uso: node tokens-to-theme.mjs <tokens.json> <global.css> [--check] | <tokens.json> --dry-run');
}

let root;
try {
  root = JSON.parse(readFileSync(resolve(tokensPath), 'utf8'));
} catch (e) {
  fail(`no se pudo leer/parsear ${tokensPath}: ${e.message}`);
}
if (!root || typeof root !== 'object' || Array.isArray(root)) fail('la raíz del JSON debe ser un objeto');

// ---------------------------------------------------------------------------
// 2. Aplanar el árbol: "a.b.c" -> { token, type, namespace, path }
// ---------------------------------------------------------------------------
const flat = new Map();
const order = [];

function walk(node, path, inheritedType, namespace) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    if (path.length) fail(`"${path.join('.')}" no es un grupo ni un token (debe ser un objeto)`);
    return;
  }
  const type = node.$type ?? inheritedType;
  if (Object.hasOwn(node, '$value')) {
    if (path.length < 2) fail(`token "${path.join('.')}" debe vivir dentro de un grupo raíz (color.*, spacing.*…)`);
    const key = path.join('.');
    flat.set(key, { token: node, type, namespace, path });
    order.push(key);
    return;
  }
  const ns = path.length === 1 ? (node.$extensions?.['kit.namespace'] ?? path[0]) : namespace;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (/[^a-z0-9_-]/i.test(k)) fail(`nombre de grupo/token inválido "${k}" en "${path.join('.')}" (solo [a-z0-9_-])`);
    walk(v, [...path, k], type, ns);
  }
}
walk(root, [], undefined, undefined);
if (flat.size === 0) fail('el archivo no contiene tokens ($value)');

// ---------------------------------------------------------------------------
// 3. Resolución de alias `{a.b.c}` (recursiva, detecta ciclos)
// ---------------------------------------------------------------------------
function refTarget(v) {
  const m = typeof v === 'string' && v.match(REF_RE);
  return m ? m[1].trim() : null;
}

function resolveValue(value, type, stack = []) {
  const target = refTarget(value);
  if (target) {
    if (stack.includes(target)) fail(`ciclo de alias: ${[...stack, target].join(' -> ')}`);
    const entry = flat.get(target);
    if (!entry) fail(`alias sin resolver: {${target}} (referenciado desde ${stack.at(-1) ?? '?'})`);
    return resolveValue(entry.token.$value, entry.type ?? type, [...stack, target]);
  }
  if (Array.isArray(value)) return { value: value.map((v) => resolveValue(v, type, stack).value), type };
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v, type, stack).value;
    return { value: out, type };
  }
  return { value, type };
}

function typeOf(key, seen = []) {
  const entry = flat.get(key);
  if (entry.type) return entry.type;
  const t = refTarget(entry.token.$value);
  if (t && flat.has(t) && !seen.includes(t)) return typeOf(t, [...seen, key]);
  return undefined;
}

// Modos de un token (si los tiene): { light, dark } ya resueltos a CSS.
function modesOf(key) {
  const entry = flat.get(key);
  if (!entry) return null;
  const ext = entry.token.$extensions ?? {};
  const modes = ext['kit.modes'] ?? (ext['kit.dark'] !== undefined ? { dark: ext['kit.dark'] } : null);
  if (!modes || typeof modes !== 'object') return null;
  if (!Object.hasOwn(modes, 'dark')) fail(`kit.modes en ${key} debe incluir al menos "dark"`);
  const type = typeOf(key);
  if (type !== 'color') fail(`kit.modes/kit.dark solo se admite en tokens de color (${key} es ${type ?? 'sin tipo'})`);
  const light = resolveValue(modes.light ?? entry.token.$value, 'color', [key]).value;
  const dark = resolveValue(modes.dark, 'color', [key]).value;
  return { light: fmtColor(light, `${key}[light]`), dark: fmtColor(dark, `${key}[dark]`) };
}

// ---------------------------------------------------------------------------
// 4. Formateo a CSS
// ---------------------------------------------------------------------------
const num = (n) => (typeof n === 'number' ? +n.toFixed(4) : n);

function fmtColor(v, where) {
  if (typeof v === 'string') {
    if (!/^(oklch|oklab|lab|lch|rgb|rgba|hsl|hwb|color|light-dark|var)\(|^#[0-9a-f]{3,8}$|^(transparent|currentColor|none)$/i.test(v)) {
      fail(`color "${v}" en ${where} no parece una sintaxis CSS válida`);
    }
    return v;
  }
  if (!v || typeof v !== 'object') fail(`color inválido en ${where}`);
  const { colorSpace, components, alpha, hex } = v;
  if (!Array.isArray(components) || components.length !== 3) {
    if (hex) return hex;
    fail(`color sin components[3] en ${where}`);
  }
  const c = components.map((x) => (x === 'none' ? 'none' : num(x)));
  const a = alpha !== undefined && alpha !== 1 ? ` / ${num(alpha)}` : '';
  const pct = (x) => (x === 'none' ? 'none' : `${num(x * 100)}%`);
  switch (colorSpace) {
    case 'oklch': return `oklch(${pct(c[0])} ${c[1]} ${c[2]}${a})`;
    case 'oklab': return `oklab(${pct(c[0])} ${c[1]} ${c[2]}${a})`;
    case 'srgb': return `color(srgb ${c[0]} ${c[1]} ${c[2]}${a})`;
    case 'display-p3': return `color(display-p3 ${c[0]} ${c[1]} ${c[2]}${a})`;
    case 'hsl': return `hsl(${c[0]} ${pct(c[1])} ${pct(c[2])}${a})`;
    default:
      if (hex) return hex;
      fail(`colorSpace no soportado "${colorSpace}" en ${where}`);
  }
}

function fmtDimension(v, where) {
  if (typeof v === 'string') {
    if (!/^(-?[\d.]+(px|rem|em|ch|ex|vw|vh|dvh|svh|lvh|vmin|vmax|%|cq[iwhb]|lh)|0|clamp\(|calc\(|min\(|max\(|var\()/.test(v)) {
      fail(`dimension "${v}" en ${where} no es una longitud CSS válida`);
    }
    return v;
  }
  if (typeof v === 'number') return `${num(v)}px`;
  if (v && typeof v === 'object' && 'value' in v) return `${num(v.value)}${v.unit ?? 'px'}`;
  fail(`dimension inválida en ${where}`);
}

function toRem(d, where) {
  const s = fmtDimension(d, where);
  const m = s.match(/^(-?[\d.]+)(px|rem)$/);
  if (!m) fail(`kit.fluid: min/max deben ser px o rem en ${where}, recibido "${s}"`);
  return m[2] === 'px' ? +m[1] / 16 : +m[1];
}

/** clamp() fluido: interpolación lineal entre dos anchos de viewport (px). */
function fmtFluid(ext, where) {
  const [vwMin, vwMax] = ext.viewport ?? [360, 1280];
  const min = toRem(ext.min, where);
  const max = toRem(ext.max, where);
  if (!(vwMax > vwMin)) fail(`kit.fluid: viewport inválido en ${where}`);
  const slope = (max - min) / ((vwMax - vwMin) / 16);
  const intercept = min - slope * (vwMin / 16);
  return `clamp(${num(Math.min(min, max))}rem, ${num(intercept)}rem + ${num(slope * 100)}vw, ${num(Math.max(min, max))}rem)`;
}

const GENERIC_FAMILY = /^(serif|sans-serif|monospace|system-ui|ui-(serif|sans-serif|monospace|rounded)|cursive|fantasy|emoji|math|fangsong|inherit)$/;
function fmtFontFamily(v, where) {
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((f) => {
      if (typeof f !== 'string') fail(`fontFamily debe ser string o string[] en ${where}`);
      if (f.startsWith('var(') || GENERIC_FAMILY.test(f) || /^["']/.test(f)) return f;
      return /\s/.test(f) ? `"${f}"` : f;
    })
    .join(', ');
}

function fmtDuration(v, where) {
  if (typeof v === 'string') {
    if (!/^-?[\d.]+(ms|s)$/.test(v)) fail(`duration "${v}" en ${where} debe ser Nms o Ns`);
    return v;
  }
  if (typeof v === 'number') return `${num(v)}ms`;
  if (v && typeof v === 'object' && 'value' in v) return `${num(v.value)}${v.unit ?? 'ms'}`;
  fail(`duration inválida en ${where}`);
}

function fmtCubicBezier(v, where) {
  if (typeof v === 'string') return v; // "linear", "ease-out", "linear(...)"
  if (!Array.isArray(v) || v.length !== 4 || v.some((n) => typeof n !== 'number')) {
    fail(`cubicBezier en ${where} debe ser [x1, y1, x2, y2] numéricos`);
  }
  return `cubic-bezier(${v.map(num).join(', ')})`;
}

function fmtShadowLayer(s, where) {
  if (!s || typeof s !== 'object') fail(`shadow inválida en ${where}`);
  const part = (k) => fmtDimension(s[k] ?? 0, `${where}.${k}`);
  const color = fmtColor(s.color ?? 'rgb(0 0 0 / 0.1)', `${where}.color`);
  return `${s.inset ? 'inset ' : ''}${part('offsetX')} ${part('offsetY')} ${part('blur')} ${part('spread')} ${color}`;
}
function fmtShadow(v, where) {
  if (typeof v === 'string') return v;
  const layers = Array.isArray(v) ? v : [v];
  if (layers.length === 0) fail(`shadow vacía en ${where}`);
  return layers.map((l, i) => fmtShadowLayer(l, `${where}[${i}]`)).join(', ');
}

function format(value, type, where) {
  switch (type) {
    case 'color': return fmtColor(value, where);
    case 'dimension': return fmtDimension(value, where);
    case 'fontFamily': return fmtFontFamily(value, where);
    case 'duration': return fmtDuration(value, where);
    case 'cubicBezier': return fmtCubicBezier(value, where);
    case 'shadow': return fmtShadow(value, where);
    case 'number': {
      if (typeof value !== 'number') fail(`number en ${where} debe ser numérico`);
      return String(num(value));
    }
    case 'fontWeight': return String(value);
    case undefined: return fail(`token sin $type (ni heredado ni por alias): ${where}`);
    default: return fail(`$type no soportado "${type}" en ${where}`);
  }
}

// En una shadow, un color referenciado a un token con modos se resuelve a light-dark() inline.
function preResolveShadowColors(value, key) {
  const fix = (layer) => {
    const t = refTarget(layer?.color);
    const m = t ? modesOf(t) : null;
    return m ? { ...layer, color: `light-dark(${m.light}, ${m.dark})` } : layer;
  };
  if (Array.isArray(value)) return value.map(fix);
  if (value && typeof value === 'object') return fix(value);
  return value;
}

// ---------------------------------------------------------------------------
// 5. Generar declaraciones agrupadas por namespace
// ---------------------------------------------------------------------------
const varName = (ns, path) => `--${[ns, ...path.slice(1).filter((s) => s !== 'DEFAULT')].join('-')}`.toLowerCase();

const groups = new Map();
const seenVars = new Set();
const push = (ns, line) => {
  const name = line.split(':')[0];
  if (seenVars.has(name)) fail(`variable duplicada ${name} (dos tokens mapean al mismo nombre)`);
  seenVars.add(name);
  if (!groups.has(ns)) groups.set(ns, []);
  groups.get(ns).push(line);
};

for (const key of order) {
  const { token, namespace, path } = flat.get(key);
  if (token.$deprecated) continue;
  const type = typeOf(key);
  const name = varName(namespace, path);
  const ext = token.$extensions ?? {};
  const modes = modesOf(key);

  if (modes) {
    push(namespace, `${name}-light: ${modes.light};`);
    push(namespace, `${name}-dark: ${modes.dark};`);
    push(namespace, `${name}: light-dark(var(${name}-light), var(${name}-dark));`);
    continue;
  }

  // Alias directo a otro token con modos -> hereda su light-dark() por var().
  const target = refTarget(token.$value);
  if (target && type === 'color' && modesOf(target)) {
    push(namespace, `${name}: var(${varName(flat.get(target).namespace, flat.get(target).path)});`);
    continue;
  }

  let css;
  if (type === 'dimension' && ext['kit.fluid']) {
    css = fmtFluid(resolveValue(ext['kit.fluid'], 'dimension', [key]).value, key);
  } else if (type === 'shadow') {
    const r = resolveValue(preResolveShadowColors(token.$value, key), 'shadow', [key]);
    css = fmtShadow(r.value, key);
  } else {
    const r = resolveValue(token.$value, type, [key]);
    css = format(r.value, r.type ?? type, key);
  }
  push(namespace, `${name}: ${css};`);
}

const header = [
  `/* Generado por scripts/tokens-to-theme.mjs desde ${basename(tokensPath)} — no editar a mano;`,
  `   edita el .tokens.json y vuelve a ejecutar el script. */`,
].join('\n');

let theme = `${header}\n@theme {\n`;
for (const [ns, lines] of groups) {
  theme += `  /* --- ${ns} --- */\n`;
  for (const l of lines) theme += `  ${l}\n`;
  theme += '\n';
}
theme = theme.replace(/\n$/, '') + '}';

// Validación de sintaxis del bloque generado.
const depth = [...theme].reduce((d, ch) => d + (ch === '{') - (ch === '}'), 0);
if (depth !== 0) fail('bloque generado con llaves desbalanceadas (bug interno)');
for (const l of theme.split('\n')) {
  if (/^\s+--/.test(l) && !/^\s+--[a-z0-9-]+: .+;$/.test(l)) fail(`declaración mal formada: ${l.trim()}`);
}
const nVars = [...groups.values()].flat().length;

// ---------------------------------------------------------------------------
// 6. Salida: --dry-run | --check | escribir
// ---------------------------------------------------------------------------
if (dryRun) {
  process.stdout.write(`${START}\n${theme}\n${END}\n`);
  console.error(`tokens-to-theme: ${flat.size} tokens -> ${nVars} variables (dry-run, no se escribió nada).`);
  process.exit(0);
}

const cssFile = resolve(cssPath);
let css;
try {
  css = readFileSync(cssFile, 'utf8');
} catch (e) {
  fail(`no se pudo leer ${cssPath}: ${e.message}`);
}
const i = css.indexOf(START);
const j = css.indexOf(END);
if (i === -1 || j === -1) fail(`faltan los marcadores ${START} / ${END} en ${cssPath}`);
if (j < i) fail(`el marcador tokens:end aparece antes que tokens:start en ${cssPath}`);
if (css.indexOf(START, i + 1) !== -1 || css.indexOf(END, j + 1) !== -1) fail('marcadores duplicados en el CSS');

const next = css.slice(0, i + START.length) + '\n' + theme + '\n' + css.slice(j);
const unchanged = next === css;

if (check) {
  console.log(
    `tokens-to-theme: OK — ${flat.size} tokens -> ${nVars} variables; ${cssPath} ${unchanged ? 'ya está al día' : 'quedaría modificado'} (--check, no se escribió nada).`,
  );
  process.exit(0);
}

if (unchanged) {
  console.log(`tokens-to-theme: ${cssPath} ya está al día (${nVars} variables), sin cambios.`);
} else {
  writeFileSync(cssFile, next, 'utf8');
  console.log(`tokens-to-theme: ${flat.size} tokens -> ${nVars} variables escritas en ${cssPath}`);
}
