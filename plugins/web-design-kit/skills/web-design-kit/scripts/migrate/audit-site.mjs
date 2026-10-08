#!/usr/bin/env node
/**
 * audit-site.mjs — auditoría técnica/SEO de un sitio existente a partir de su `inventory.json`
 * (producido por crawl-site.mjs o scan-source.mjs).
 *
 * Uso:
 *   node audit-site.mjs <inventory.json> --out <dir> [--lighthouse] [--json] [--help]
 *
 * Escribe <out>/audit.md (informe en lenguaje de cliente, secciones del spec §2) y <out>/audit.json:
 *   { summary:{pages, errors, warnings, broken, duplicates, heavyImages, jsOnly},
 *     pages:[{url, status, errors[], warnings[], info[]}], brokenLinks:[{from,to,status}],
 *     unresolved:[{from,to,reason}], duplicates:[{contentHash, urls[]}], heavyImages:[{page,src,bytes?}],
 *     imagesNoDimensions:[{page,src}], lighthouse?:[{url, perf, a11y, bp, seo, lcp, cls} | {url, error}],
 *     stack:{detected, signals[], risks[]}, aiCrawlers:{allowed:[],blocked:[], source}, security:{...} }
 *
 * - Comprobaciones por página: reutiliza `auditHtml` de ../check-seo.mjs sobre `raw/<file>`
 *   (title/description/h1/canonical/alt/JSON-LD/lang/OG). Si no hay raw, se usan los metadatos del inventario.
 * - Enlaces rotos: destino = Page con status ≥ 400, o skipped con reason 'error'. Con `source.kind` dir|repo
 *   (no hay status real) también cuenta un destino ausente de pages/skipped, salvo rutas dinámicas del CMS
 *   (/tag/, /author/, /category/, /feed/, /page/N/…) que se listan como «no verificables».
 * - Imágenes: > 300 KB si el inventario trae `images[].bytes`; sin width/height → advertencia.
 * - robots.txt: `raw/robots.txt` si el rastreador lo guardó; si no y `source.kind === 'url'`, se descarga de
 *   `origin/robots.txt`; si no, «no disponible». Igual para sitemap.xml.
 * - Lighthouse (solo --lighthouse): top 5 páginas por enlaces entrantes con
 *   `npx -y lighthouse <url> --output=json --quiet --chrome-flags="--headless=new --no-sandbox"`.
 *   Si falla o no hay Chrome → «no ejecutado: <motivo>». Nunca se ejecuta sobre inventarios de carpeta.
 *
 * Exporta: audit(inv, opts), findBrokenLinks(inv), findDuplicates(pages), parseRobotsForAi(txt),
 *          detectStack(inv, rawReader), renderMarkdown(result), AI_CRAWLERS.
 *
 * Cero dependencias. Node ≥ 22. Exit 1 en error fatal, 0 en informativo.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

import { auditHtml } from '../check-seo.mjs';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const HEAVY_IMAGE_BYTES = 300 * 1024;
export const LIGHTHOUSE_TOP = 5;
const LIGHTHOUSE_TIMEOUT_MS = 180_000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'web-design-kit-migrate/1.0';

/** Rastreadores de IA conocidos (nombre de User-agent en robots.txt). */
export const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
];

/** Rutas que un CMS genera dinámicamente: en un inventario de carpeta no se pueden verificar. */
const CMS_DYNAMIC_RE = /\/(tag|tags|category|categories|author|feed|page\/\d+|wp-json|wp-admin|wp-login\.php|comments\/feed|search|\?s=)(\/|$)/i;

/** Enlaces a recursos no HTML: se omiten del cálculo de rotos en modo carpeta. */
const ASSET_EXT_RE = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|rar|7z|docx?|xlsx?|pptx?|mp[34]|webm|woff2?|ttf|eot)$/i;

const SKIPPED_RESOLVABLE = new Set(['robots', 'redirect', 'external-redirect', 'js-only', 'non-html']);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return String(url);
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function mdCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fmtBytes(n) {
  if (n == null) return '—';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

async function fetchText(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Enlaces rotos
// ---------------------------------------------------------------------------

/**
 * Calcula enlaces internos rotos.
 * - Destino = Page con status ≥ 400 → roto (status real).
 * - Destino en skipped con reason 'error' → roto (status null).
 * - Destino en skipped con reason robots|redirect|external-redirect|js-only|non-html → resoluble.
 * - Destino ausente: con kind 'url' → `unresolved` (no rastreado, p. ej. --max-pages); con kind dir|repo →
 *   roto (status null), salvo rutas dinámicas del CMS o recursos no HTML → `unresolved`.
 * @param {object} inv Inventory
 * @returns {{broken: {from: string, to: string, status: number|null}[], unresolved: {from: string, to: string, reason: string}[]}}
 */
export function findBrokenLinks(inv) {
  const kind = inv.source?.kind ?? 'url';
  const pagesByUrl = new Map();
  for (const p of inv.pages ?? []) {
    pagesByUrl.set(p.url, p);
    if (p.finalUrl && !pagesByUrl.has(p.finalUrl)) pagesByUrl.set(p.finalUrl, p);
  }
  const skippedByUrl = new Map();
  for (const s of inv.skipped ?? []) skippedByUrl.set(s.url, s);

  const broken = [];
  const unresolved = [];
  const seen = new Set();
  const push = (arr, entry) => {
    const key = `${entry.from}→${entry.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    arr.push(entry);
  };

  for (const p of inv.pages ?? []) {
    if (p.status != null && p.status >= 400) continue; // las páginas de error no "enlazan" nada útil
    for (const to of p.links ?? []) {
      const target = pagesByUrl.get(to);
      if (target) {
        if (target.status != null && target.status >= 400) push(broken, { from: p.url, to, status: target.status });
        continue;
      }
      const sk = skippedByUrl.get(to);
      if (sk) {
        if (sk.reason === 'error') push(broken, { from: p.url, to, status: sk.status ?? null });
        else if (!SKIPPED_RESOLVABLE.has(sk.reason)) push(unresolved, { from: p.url, to, reason: `omitido: ${sk.reason}` });
        continue;
      }
      const path = pathOf(to);
      if (kind === 'url') {
        push(unresolved, { from: p.url, to, reason: 'no rastreado' });
      } else if (CMS_DYNAMIC_RE.test(path)) {
        push(unresolved, { from: p.url, to, reason: 'ruta dinámica del CMS; no verificable en carpeta' });
      } else if (ASSET_EXT_RE.test(path.split('?')[0])) {
        push(unresolved, { from: p.url, to, reason: 'recurso no HTML; no verificable en carpeta' });
      } else {
        push(broken, { from: p.url, to, status: null });
      }
    }
  }
  broken.sort((a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from));
  unresolved.sort((a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from));
  return { broken, unresolved };
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

/** Grupos de páginas (status < 400) con el mismo `contentHash` y ≥ 2 URLs. */
export function findDuplicates(pages) {
  const groups = new Map();
  for (const p of pages ?? []) {
    if (!p.contentHash) continue;
    if (p.status != null && p.status >= 400) continue;
    if (!(p.wordCount > 0)) continue;
    if (!groups.has(p.contentHash)) groups.set(p.contentHash, []);
    groups.get(p.contentHash).push(p.url);
  }
  return [...groups.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([contentHash, urls]) => ({ contentHash, urls: urls.sort() }))
    .sort((a, b) => b.urls.length - a.urls.length || a.urls[0].localeCompare(b.urls[0]));
}

// ---------------------------------------------------------------------------
// robots.txt → rastreadores de IA
// ---------------------------------------------------------------------------

function parseRobotsGroups(txt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(txt ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'disallow' || field === 'allow') current.rules.push({ allow: field === 'allow', pattern: value });
  }
  return groups;
}

/**
 * Determina qué rastreadores de IA quedan bloqueados en la raíz (`Disallow: /` aplicable sin un `Allow: /`).
 * Grupo específico del agente > grupo `*`.
 * @param {string} txt
 * @returns {{allowed: string[], blocked: string[]}}
 */
export function parseRobotsForAi(txt) {
  const groups = parseRobotsGroups(txt);
  const star = groups.find((g) => g.agents.includes('*')) ?? null;
  const allowed = [];
  const blocked = [];
  for (const bot of AI_CRAWLERS) {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    const g = own ?? star;
    let isBlocked = false;
    if (g) {
      const disallowRoot = g.rules.some((r) => !r.allow && (r.pattern === '/' || r.pattern === '/*'));
      const allowRoot = g.rules.some((r) => r.allow && (r.pattern === '/' || r.pattern === '/*'));
      isBlocked = disallowRoot && !allowRoot;
    }
    (isBlocked ? blocked : allowed).push(bot);
  }
  return { allowed, blocked };
}

function robotsSummary(txt) {
  const groups = parseRobotsGroups(txt);
  const sitemaps = [];
  for (const line of String(txt).split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m) sitemaps.push(m[1]);
  }
  const star = groups.find((g) => g.agents.includes('*'));
  const disallowAll = Boolean(star && star.rules.some((r) => !r.allow && r.pattern === '/'));
  const disallowed = star ? star.rules.filter((r) => !r.allow && r.pattern).map((r) => r.pattern) : [];
  return { groups: groups.length, sitemaps, disallowAll, disallowed };
}

// ---------------------------------------------------------------------------
// Stack y riesgos
// ---------------------------------------------------------------------------

const STACK_SIGNATURES = [
  { id: 'wordpress', label: 'WordPress', re: /wp-content\/|wp-includes\/|<meta[^>]+generator[^>]+WordPress/i },
  { id: 'wix', label: 'Wix', re: /wixsite\.com|static\.wixstatic\.com|X-Wix-/i },
  { id: 'squarespace', label: 'Squarespace', re: /squarespace\.com|static1\.squarespace/i },
  { id: 'shopify', label: 'Shopify', re: /cdn\.shopify\.com|Shopify\.theme/i },
  { id: 'webflow', label: 'Webflow', re: /webflow\.com|data-wf-page/i },
  { id: 'joomla', label: 'Joomla', re: /<meta[^>]+generator[^>]+Joomla|\/media\/jui\//i },
  { id: 'drupal', label: 'Drupal', re: /<meta[^>]+generator[^>]+Drupal|\/sites\/default\/files\//i },
  { id: 'next', label: 'Next.js', re: /\/_next\/static\/|id="__next"/i },
  { id: 'nuxt', label: 'Nuxt', re: /\/_nuxt\/|id="__nuxt"/i },
  { id: 'gatsby', label: 'Gatsby', re: /id="___gatsby"/i },
  { id: 'astro', label: 'Astro', re: /<astro-island|<meta[^>]+generator[^>]+Astro/i },
  { id: 'hugo', label: 'Hugo', re: /<meta[^>]+generator[^>]+Hugo/i },
  { id: 'jekyll', label: 'Jekyll', re: /<meta[^>]+generator[^>]+Jekyll/i },
  { id: 'godaddy', label: 'GoDaddy Website Builder', re: /img1\.wsimg\.com|godaddy/i },
];

const LIB_SIGNATURES = [
  { id: 'jquery', label: 'jQuery', re: /jquery(?:\.min)?\.js|jquery-migrate/i },
  { id: 'elementor', label: 'Elementor', re: /elementor/i },
  { id: 'wpbakery', label: 'WPBakery', re: /js_composer|wpb_/i },
  { id: 'divi', label: 'Divi', re: /et_pb_|Divi/ },
  { id: 'bootstrap', label: 'Bootstrap', re: /bootstrap(?:\.min)?\.(css|js)/i },
  { id: 'gtm', label: 'Google Tag Manager', re: /googletagmanager\.com/i },
  { id: 'ga-ua', label: 'Google Analytics Universal (obsoleto)', re: /google-analytics\.com\/analytics\.js|UA-\d{4,}-\d/i },
  { id: 'fontawesome', label: 'Font Awesome', re: /font-awesome|fontawesome/i },
  { id: 'google-fonts', label: 'Google Fonts externas', re: /fonts\.googleapis\.com/i },
  { id: 'recaptcha', label: 'reCAPTCHA', re: /recaptcha/i },
  { id: 'wpforms', label: 'Formularios (WPForms/CF7)', re: /wpforms|wpcf7/i },
];

const STACK_RISKS = {
  wordpress: [
    'Plugins y tema con actualizaciones pendientes: superficie de ataque típica (XML-RPC, wp-login, uploads).',
    'Rutas dinámicas (/tag/, /author/, /feed/, /page/N/) generan URLs indexables sin valor: hay que redirigirlas o excluirlas.',
    'Rendimiento dependiente de PHP + base de datos y del número de plugins activos.',
  ],
  wix: ['Plataforma cerrada: no se puede exportar la plantilla; el contenido se extrae del HTML renderizado.', 'HTML pesado y dependiente de JavaScript; LCP y TBT suelen ser altos.'],
  squarespace: ['Plataforma cerrada: exportación parcial (solo blog) y sin control del HTML/cabeceras.'],
  shopify: ['Tienda con carrito: fuera del alcance de la migración (solo páginas informativas).'],
  webflow: ['Exportación de código disponible pero con clases generadas; el CMS no se exporta.'],
  joomla: ['Núcleo y extensiones con historial de vulnerabilidades; estructura de URLs con IDs numéricos.'],
  drupal: ['Migraciones costosas entre versiones mayores; URLs /node/N frecuentes.'],
  next: ['Contenido parcialmente renderizado en cliente: verificar que el inventario incluya texto (ver jsOnly).'],
  nuxt: ['Contenido parcialmente renderizado en cliente: verificar que el inventario incluya texto (ver jsOnly).'],
  gatsby: ['Build acoplado a plugins de Gatsby; revisar que las rutas estáticas se conserven.'],
  godaddy: ['Constructor propietario sin exportación; se extrae del HTML renderizado.'],
};

const LIB_RISKS = {
  jquery: 'jQuery cargado en todas las páginas: JavaScript innecesario para un sitio informativo.',
  elementor: 'Elementor: HTML anidado y CSS/JS pesados por página; el diseño no se migra, se rehace.',
  wpbakery: 'WPBakery: shortcodes en el contenido; requiere limpieza al extraer el Markdown.',
  divi: 'Divi: shortcodes y CSS inline masivo; el contenido se extrae del HTML renderizado.',
  'ga-ua': 'Google Analytics Universal dejó de recibir datos en 2023: no hay medición real.',
  'google-fonts': 'Fuentes servidas desde Google: petición a terceros y posible incumplimiento RGPD; la plantilla las autoaloja.',
  recaptcha: 'reCAPTCHA: formulario con backend; fuera del alcance (se sustituye por el proveedor de formularios elegido).',
  wpforms: 'Formularios con backend del CMS: hay que decidir el proveedor de formularios en el nuevo sitio.',
};

/**
 * Detecta el stack a partir de `source.stack` + firmas en el HTML de las primeras páginas.
 * @param {object} inv
 * @param {(page: object) => string|null} readRaw
 * @returns {{detected: string|null, declared: string|null, signals: string[], libraries: string[], risks: string[]}}
 */
export function detectStack(inv, readRaw) {
  const declared = inv.source?.stack ?? null;
  const hits = new Map();
  const libs = new Map();
  let generator = null;
  const sample = (inv.pages ?? []).slice(0, 50);
  for (const p of sample) {
    const html = readRaw(p);
    if (!html) continue;
    if (!generator) {
      const m = /<meta[^>]+name\s*=\s*["']generator["'][^>]+content\s*=\s*["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']generator["']/i.exec(html);
      if (m) generator = m[1];
    }
    for (const s of STACK_SIGNATURES) if (s.re.test(html)) hits.set(s.id, (hits.get(s.id) ?? 0) + 1);
    for (const l of LIB_SIGNATURES) if (l.re.test(html)) libs.set(l.id, (libs.get(l.id) ?? 0) + 1);
  }
  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  let detected = ranked.length ? ranked[0][0] : null;
  if (!detected && declared && declared !== 'static' && declared !== 'unknown') detected = declared;
  const signals = [];
  if (generator) signals.push(`meta generator: ${generator}`);
  for (const [id, n] of ranked) signals.push(`${STACK_SIGNATURES.find((s) => s.id === id).label} (${n}/${sample.length} páginas)`);
  if (declared) signals.push(`inventario: stack ${declared}`);
  const libraries = [...libs.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => LIB_SIGNATURES.find((l) => l.id === id).label);
  const risks = [...(STACK_RISKS[detected] ?? [])];
  for (const [id] of libs) if (LIB_RISKS[id]) risks.push(LIB_RISKS[id]);
  return { detected, declared, signals, libraries, risks };
}

// ---------------------------------------------------------------------------
// Seguridad: HTTPS y mixed content
// ---------------------------------------------------------------------------

const MIXED_RE = /<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*\s(?:src|href|data)\s*=\s*["']http:\/\/[^"']+/gi;

function findMixedContent(page, html) {
  const out = [];
  const seen = new Set();
  if (html) {
    for (const m of html.matchAll(MIXED_RE)) {
      const url = /http:\/\/[^"']+/.exec(m[0])?.[0];
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push({ page: page.url, src: url });
      }
    }
  } else {
    for (const img of page.images ?? []) {
      if (/^http:\/\//i.test(img.src) && !seen.has(img.src)) {
        seen.add(img.src);
        out.push({ page: page.url, src: img.src });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------

function inboundCounts(inv) {
  const counts = new Map();
  for (const p of inv.pages ?? []) counts.set(p.url, 0);
  for (const p of inv.pages ?? []) {
    for (const to of new Set(p.links ?? [])) {
      if (to === p.url) continue;
      if (counts.has(to)) counts.set(to, counts.get(to) + 1);
    }
  }
  return counts;
}

/** Top N páginas (status < 400) por enlaces entrantes; la portada siempre primero si existe. */
export function topPagesByInbound(inv, n = LIGHTHOUSE_TOP) {
  const counts = inboundCounts(inv);
  const origin = inv.source?.origin ?? null;
  const home = origin ? `${origin}/` : null;
  const ranked = (inv.pages ?? [])
    .filter((p) => p.status == null || p.status < 400)
    .map((p) => ({ url: p.url, inbound: counts.get(p.url) ?? 0 }))
    .sort((a, b) => (a.url === home ? -1 : b.url === home ? 1 : 0) || b.inbound - a.inbound || a.url.localeCompare(b.url));
  return ranked.slice(0, n);
}

function runLighthouseOnce(url, { timeoutMs = LIGHTHOUSE_TIMEOUT_MS } = {}) {
  return new Promise((resolveP) => {
    const args = ['-y', 'lighthouse', url, '--output=json', '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--only-categories=performance,accessibility,best-practices,seo', '--form-factor=mobile'];
    let child;
    try {
      child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    } catch (err) {
      resolveP({ url, error: `no se pudo lanzar npx: ${err.message}` });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveP({ url, error: `tiempo agotado (${Math.round(timeoutMs / 1000)} s)` });
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolveP({ url, error: `npx no disponible: ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        const reason = /chrome/i.test(stderr) ? 'Chrome no encontrado o no se pudo iniciar' : `lighthouse terminó con código ${code}`;
        resolveP({ url, error: `${reason}${stderr.trim() ? `: ${stderr.trim().split('\n').slice(-1)[0].slice(0, 200)}` : ''}` });
        return;
      }
      try {
        const start = stdout.indexOf('{');
        const lhr = JSON.parse(stdout.slice(start));
        const cat = (k) => (lhr.categories?.[k]?.score != null ? Math.round(lhr.categories[k].score * 100) : null);
        const num = (k) => lhr.audits?.[k]?.numericValue ?? null;
        resolveP({
          url,
          perf: cat('performance'),
          a11y: cat('accessibility'),
          bp: cat('best-practices'),
          seo: cat('seo'),
          lcp: num('largest-contentful-paint') != null ? Math.round(num('largest-contentful-paint')) : null,
          cls: num('cumulative-layout-shift') != null ? Number(num('cumulative-layout-shift').toFixed(3)) : null,
        });
      } catch (err) {
        resolveP({ url, error: `salida JSON ilegible: ${err.message}` });
      }
    });
  });
}

async function runLighthouse(inv, { runner = runLighthouseOnce, log = () => {} } = {}) {
  const kind = inv.source?.kind ?? 'url';
  const targets = topPagesByInbound(inv);
  if (kind !== 'url') {
    return targets.map((t) => ({ url: t.url, error: 'el inventario no proviene de una URL pública (kind ' + kind + '); publica el sitio o usa crawl-site' }));
  }
  if (!targets.length) return [];
  const results = [];
  for (const t of targets) {
    log(`lighthouse ${t.url}…`);
    results.push(await runner(t.url));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

function makeRawReader(inventoryDir) {
  const cache = new Map();
  return (page) => {
    if (!page?.rawFile || !inventoryDir) return null;
    if (cache.has(page.rawFile)) return cache.get(page.rawFile);
    let html = null;
    try {
      const file = resolve(inventoryDir, page.rawFile);
      if (existsSync(file)) html = readFileSync(file, 'utf8');
    } catch {
      html = null;
    }
    cache.set(page.rawFile, html);
    return html;
  };
}

/** Comprobaciones mínimas cuando no hay HTML crudo (inventario por convención de rutas, etc.). */
function auditFromMetadata(page) {
  const r = { errors: [], warnings: [], info: [] };
  if (!page.title) r.errors.push({ code: 'title', msg: 'Sin <title> en el inventario' });
  if (!page.description) r.errors.push({ code: 'description', msg: 'Sin meta description en el inventario' });
  if (!page.h1) r.errors.push({ code: 'h1', msg: 'Sin <h1> en el inventario' });
  if (!page.canonical) r.errors.push({ code: 'canonical', msg: 'Sin canonical en el inventario' });
  if (!page.lang) r.errors.push({ code: 'html-lang', msg: 'Sin <html lang> en el inventario' });
  for (const img of page.images ?? []) {
    if (img.alt == null) r.errors.push({ code: 'img-alt', msg: `<img> sin atributo alt: ${img.src}` });
    if (!img.width || !img.height) r.warnings.push({ code: 'img-dimensions', msg: `<img> sin width/height (riesgo CLS): ${img.src}` });
  }
  r.info.push({ code: 'no-raw', msg: 'Sin HTML crudo: comprobaciones limitadas a los metadatos del inventario' });
  return r;
}

async function loadSiteFiles(inv, { inventoryDir, fetch: allowFetch }) {
  const origin = inv.source?.origin ?? null;
  const kind = inv.source?.kind ?? 'url';
  const result = { robots: null, robotsSource: null, sitemap: null, sitemapSource: null };
  for (const [key, name] of [
    ['robots', 'robots.txt'],
    ['sitemap', 'sitemap.xml'],
  ]) {
    if (inventoryDir) {
      const local = join(inventoryDir, 'raw', name);
      if (existsSync(local)) {
        result[key] = readFileSync(local, 'utf8');
        result[`${key}Source`] = `raw/${name}`;
        continue;
      }
    }
    if (allowFetch && kind === 'url' && origin && /^https?:/.test(origin)) {
      const txt = await fetchText(`${origin}/${name}`);
      if (txt != null) {
        result[key] = txt;
        result[`${key}Source`] = `${origin}/${name}`;
      }
    }
  }
  return result;
}

/**
 * Audita un inventario y escribe `<out>/audit.md` + `<out>/audit.json`.
 * @param {object} inv Inventory (crawl-site o scan-source)
 * @param {{inventoryDir?: string|null, out: string, lighthouse?: boolean, fetch?: boolean, log?: Function, lighthouseRunner?: Function}} opts
 *   - `inventoryDir`: carpeta que contiene `raw/` (por defecto, la carpeta del inventory.json).
 *   - `fetch`: permitir descargar robots.txt/sitemap.xml del origen (solo kind url). Por defecto true.
 * @returns {Promise<object>} resultado (igual que audit.json)
 */
export async function audit(inv, { inventoryDir = null, out, lighthouse = false, fetch: allowFetch = true, log = () => {}, lighthouseRunner } = {}) {
  if (!out) throw new Error('Falta --out <dir>');
  if (!inv || !Array.isArray(inv.pages)) throw new Error('Inventario inválido: falta `pages[]`');
  const origin = inv.source?.origin ?? null;
  const kind = inv.source?.kind ?? 'url';
  const readRaw = makeRawReader(inventoryDir);

  // Páginas
  const pages = [];
  const heavyImages = [];
  const imagesNoDimensions = [];
  const mixedContent = [];
  const isHttps = origin ? origin.startsWith('https://') : false;
  let imagesTotal = 0;
  let imagesWithBytes = 0;
  for (const p of inv.pages) {
    const html = readRaw(p);
    const r = html != null ? auditHtml(html, { url: p.url, site: origin }) : auditFromMetadata(p);
    pages.push({ url: p.url, status: p.status ?? null, errors: r.errors, warnings: r.warnings, info: r.info });
    for (const img of p.images ?? []) {
      imagesTotal++;
      if (typeof img.bytes === 'number') {
        imagesWithBytes++;
        if (img.bytes > HEAVY_IMAGE_BYTES) heavyImages.push({ page: p.url, src: img.src, bytes: img.bytes });
      }
      if (!img.width || !img.height) imagesNoDimensions.push({ page: p.url, src: img.src });
    }
    if (isHttps) mixedContent.push(...findMixedContent(p, html));
  }

  const { broken, unresolved } = findBrokenLinks(inv);
  const duplicates = findDuplicates(inv.pages);
  const jsOnly = (inv.skipped ?? []).filter((s) => s.reason === 'js-only');
  const errorPages = inv.pages.filter((p) => p.status != null && p.status >= 400);
  const noindexPages = pages.filter((p) => p.info.some((f) => f.code === 'noindex')).map((p) => p.url);

  // Seguridad y rastreo
  const files = await loadSiteFiles(inv, { inventoryDir, fetch: allowFetch });
  const aiCrawlers = files.robots != null ? { ...parseRobotsForAi(files.robots), source: files.robotsSource } : { allowed: [], blocked: [], source: null };
  const robots = files.robots != null ? { available: true, source: files.robotsSource, ...robotsSummary(files.robots) } : { available: false, source: null };
  let sitemap = { available: false, source: null, urls: 0 };
  if (files.sitemap != null) {
    const locs = [...files.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    const isIndex = /<sitemapindex[\s>]/i.test(files.sitemap);
    // Se compara por ruta (no por host) para tolerar www./puerto distintos entre sitemap y rastreo.
    const inventoried = new Set(inv.pages.map((p) => pathOf(p.url).replace(/\/?$/, '/')));
    const missing = isIndex ? [] : locs.filter((u) => !inventoried.has(pathOf(u).replace(/\/?$/, '/')));
    sitemap = { available: true, source: files.sitemapSource, urls: locs.length, isIndex, notInInventory: missing.length };
  }
  const security = {
    origin,
    https: origin ? isHttps : null,
    localOrigin: Boolean(origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin)),
    mixedContent,
    robots,
    sitemap,
    noindexPages,
  };

  const stack = detectStack(inv, readRaw);

  const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { kind, origin, stack: inv.source?.stack ?? null },
    summary: {
      pages: inv.pages.length,
      okPages: inv.pages.length - errorPages.length,
      errorPages: errorPages.length,
      errors: pages.reduce((n, p) => n + p.errors.length, 0),
      warnings: pages.reduce((n, p) => n + p.warnings.length, 0),
      pagesWithErrors: pages.filter((p) => p.errors.length).length,
      broken: broken.length,
      unresolved: unresolved.length,
      duplicates: duplicates.length,
      heavyImages: heavyImages.length,
      imagesNoDimensions: imagesNoDimensions.length,
      imagesTotal,
      imagesWithBytes,
      jsOnly: jsOnly.length,
      skipped: (inv.skipped ?? []).length,
      mixedContent: mixedContent.length,
      noindex: noindexPages.length,
    },
    pages,
    brokenLinks: broken,
    unresolved,
    duplicates,
    heavyImages,
    imagesNoDimensions,
    stack,
    aiCrawlers,
    security,
    jsOnly: jsOnly.map((s) => s.url),
  };

  if (lighthouse) {
    result.lighthouse = await runLighthouse(inv, { runner: lighthouseRunner, log });
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'audit.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'audit.md'), renderMarkdown(result), 'utf8');
  return result;
}

// ---------------------------------------------------------------------------
// Informe Markdown
// ---------------------------------------------------------------------------

const CODE_LABELS = {
  title: 'título',
  'title-length': 'longitud del título',
  description: 'descripción',
  'description-length': 'longitud de la descripción',
  h1: 'H1',
  canonical: 'canónica',
  'canonical-absolute': 'canónica relativa',
  'canonical-self': 'canónica a otra URL',
  'canonical-site': 'canónica a otro dominio',
  'img-alt': 'imagen sin alt',
  'img-dimensions': 'imagen sin dimensiones',
  'html-lang': 'idioma',
  'og:title': 'og:title',
  'og:description': 'og:description',
  'og:image': 'og:image',
  'twitter:card': 'twitter:card',
  'jsonld-parse': 'JSON-LD inválido',
  'jsonld-context': 'JSON-LD sin @context',
  'jsonld-type': 'JSON-LD sin @type',
  'lcp-lazy': 'LCP con lazy',
  'link-html': 'enlace .html',
  'link-double-slash': 'enlace //',
};

function countCodes(pages, level) {
  const counts = new Map();
  for (const p of pages) for (const f of p[level]) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function label(code) {
  return CODE_LABELS[code] ?? code;
}

function executiveSummary(r) {
  const s = r.summary;
  const bullets = [];
  const pct = (n) => (s.pages ? Math.round((n / s.pages) * 100) : 0);

  const missingTitle = r.pages.filter((p) => p.errors.some((f) => f.code === 'title')).length;
  const missingDesc = r.pages.filter((p) => p.errors.some((f) => f.code === 'description')).length;
  const missingH1 = r.pages.filter((p) => p.errors.some((f) => f.code === 'h1')).length;
  const missingCanon = r.pages.filter((p) => p.errors.some((f) => /^canonical/.test(f.code))).length;
  const missingOg = r.pages.filter((p) => p.errors.some((f) => /^(og:|twitter:)/.test(f.code))).length;
  const noAlt = r.pages.reduce((n, p) => n + p.errors.filter((f) => f.code === 'img-alt').length, 0);

  bullets.push(`Se revisaron **${plural(s.pages, 'página', 'páginas')}**${s.skipped ? ` (y ${s.skipped} URL omitidas: redirecciones, bloqueos o recursos no HTML)` : ''}; **${s.pagesWithErrors}** (${pct(s.pagesWithErrors)} %) tienen al menos un fallo SEO que hoy resta visibilidad en Google.`);
  if (missingTitle || missingDesc || missingH1 || missingCanon) {
    bullets.push(`**${missingDesc}** páginas sin descripción, **${missingTitle}** sin título propio, **${missingH1}** sin un único H1 y **${missingCanon}** sin canónica correcta: Google improvisa el texto del resultado y no sabe cuál es la URL oficial de cada página.`);
  } else {
    bullets.push('Título, descripción, H1 y canónica están presentes en todas las páginas: la base técnica se conserva en la migración.');
  }
  if (missingOg) bullets.push(`**${missingOg}** páginas sin etiquetas Open Graph/Twitter completas: al compartirlas en WhatsApp, Facebook o LinkedIn salen sin imagen ni descripción.`);
  if (s.broken || s.errorPages) bullets.push(`**${plural(s.broken, 'enlace roto', 'enlaces rotos')}** dentro del sitio${s.errorPages ? ` y **${s.errorPages}** URL que responden con error (4xx/5xx)` : ''}: cada uno es un visitante que se va y una señal negativa para el rastreo.`);
  else bullets.push('Sin enlaces internos rotos: la navegación actual es íntegra.');
  if (s.duplicates) bullets.push(`**${plural(s.duplicates, 'grupo', 'grupos')} de contenido duplicado**: páginas idénticas compiten entre sí y diluyen el posicionamiento.`);
  else bullets.push('Sin contenido duplicado entre páginas.');
  const imgParts = [];
  if (noAlt) imgParts.push(`**${noAlt}** sin texto alternativo (invisibles para Google Imágenes y lectores de pantalla)`);
  if (s.heavyImages) imgParts.push(`**${s.heavyImages}** superan los 300 KB (ralentizan la carga en móvil)`);
  if (s.imagesNoDimensions) imgParts.push(`**${s.imagesNoDimensions}** sin ancho/alto declarados (la página «salta» al cargar, penalizado en Core Web Vitals)`);
  if (imgParts.length) bullets.push(`De **${plural(s.imagesTotal, 'imagen', 'imágenes')}**: ${imgParts.join('; ')}.`);
  else bullets.push(`**${plural(s.imagesTotal, 'imagen', 'imágenes')}** con alt y dimensiones declaradas${s.imagesWithBytes ? '' : '; el peso no se pudo medir en este inventario'}.`);
  if (r.security.https === false && !r.security.localOrigin) bullets.push('El sitio **no usa HTTPS**: el navegador lo marca como «No seguro» y Google lo penaliza.');
  if (s.mixedContent) bullets.push(`**${s.mixedContent}** recursos se cargan por HTTP en un sitio HTTPS (contenido mixto): candado roto y recursos bloqueados.`);
  if (s.jsOnly) bullets.push(`**${s.jsOnly}** páginas dependen de JavaScript para mostrar su contenido: parte del texto puede no indexarse.`);
  if (r.aiCrawlers.source) {
    bullets.push(`Rastreadores de IA: **${r.aiCrawlers.blocked.length} bloqueados**, ${r.aiCrawlers.allowed.length} permitidos (según robots.txt)${r.security.sitemap.available ? `; sitemap con ${r.security.sitemap.urls} URL` : '; sin sitemap.xml accesible'}.`);
  } else {
    bullets.push('No se pudo leer robots.txt: no se sabe qué buscadores ni asistentes de IA pueden rastrear el sitio.');
  }
  if (r.stack.detected) bullets.push(`Tecnología detectada: **${STACK_SIGNATURES.find((x) => x.id === r.stack.detected)?.label ?? r.stack.detected}**${r.stack.libraries.length ? ` con ${r.stack.libraries.slice(0, 3).join(', ')}` : ''}; ver riesgos al final.`);
  return bullets.slice(0, 8);
}

/**
 * Renderiza audit.md a partir del resultado. Secciones en el orden del spec §2.
 * @param {object} r resultado de audit()
 * @returns {string}
 */
export function renderMarkdown(r) {
  const s = r.summary;
  const L = [];
  const originLabel = r.source.origin ?? '(sin origen)';
  L.push(`# Auditoría del sitio actual — ${originLabel}`);
  L.push('');
  L.push(`Generada el ${r.generatedAt.slice(0, 10)} a partir de un inventario de tipo \`${r.source.kind}\` (${plural(s.pages, 'página', 'páginas')}${s.skipped ? `, ${s.skipped} omitidas` : ''}).`);
  L.push('');

  // 1. Resumen ejecutivo
  L.push('## Resumen ejecutivo');
  L.push('');
  L.push('Qué pierde el sitio hoy, en cifras:');
  L.push('');
  for (const b of executiveSummary(r)) L.push(`- ${b}`);
  L.push('');
  L.push(`Totales: ${plural(s.errors, 'error', 'errores')} · ${plural(s.warnings, 'advertencia', 'advertencias')} · ${plural(s.broken, 'enlace roto', 'enlaces rotos')} · ${plural(s.duplicates, 'grupo duplicado', 'grupos duplicados')} · ${plural(s.heavyImages, 'imagen pesada', 'imágenes pesadas')} · ${plural(s.jsOnly, 'página solo-JS', 'páginas solo-JS')}.`);
  L.push('');

  // 2. Páginas con errores
  L.push('## Páginas con errores');
  L.push('');
  const withErrors = r.pages.filter((p) => p.errors.length).sort((a, b) => b.errors.length - a.errors.length || a.url.localeCompare(b.url));
  if (!withErrors.length) {
    L.push('Ninguna página presenta errores en título, descripción, canónica, H1, alt, JSON-LD, idioma u Open Graph.');
  } else {
    const topCodes = countCodes(r.pages, 'errors');
    L.push(`${withErrors.length} de ${s.pages} páginas con errores. Fallos más frecuentes: ${topCodes.slice(0, 6).map(([c, n]) => `${label(c)} (${n})`).join(', ')}.`);
    L.push('');
    L.push('| Página | Estado | Errores | Detalle |');
    L.push('|---|---|---|---|');
    const MAX_ROWS = 60;
    for (const p of withErrors.slice(0, MAX_ROWS)) {
      const codes = [...new Set(p.errors.map((f) => label(f.code)))].join(', ');
      L.push(`| ${mdCell(pathOf(p.url))} | ${p.status ?? '—'} | ${p.errors.length} | ${mdCell(codes)} |`);
    }
    if (withErrors.length > MAX_ROWS) L.push(`| … | | | ${withErrors.length - MAX_ROWS} páginas más en audit.json |`);
    const warnCodes = countCodes(r.pages, 'warnings');
    if (warnCodes.length) {
      L.push('');
      L.push(`Advertencias (no bloquean, pero conviene corregir): ${warnCodes.slice(0, 6).map(([c, n]) => `${label(c)} (${n})`).join(', ')}.`);
    }
  }
  if (r.security.noindexPages.length) {
    L.push('');
    L.push(`Páginas con \`noindex\` (excluidas de buscadores a propósito): ${r.security.noindexPages.map((u) => `\`${pathOf(u)}\``).join(', ')}.`);
  }
  L.push('');

  // 3. Enlaces rotos
  L.push('## Enlaces rotos');
  L.push('');
  if (!r.brokenLinks.length) {
    L.push('No se encontraron enlaces internos rotos.');
  } else {
    L.push(`${plural(r.brokenLinks.length, 'enlace interno roto', 'enlaces internos rotos')} (${new Set(r.brokenLinks.map((b) => b.to)).size} destinos distintos). En la migración cada destino recibe una redirección 301 o se elimina el enlace.`);
    L.push('');
    L.push('| Desde | Hacia | Estado |');
    L.push('|---|---|---|');
    for (const b of r.brokenLinks.slice(0, 100)) L.push(`| ${mdCell(pathOf(b.from))} | ${mdCell(pathOf(b.to))} | ${b.status ?? 'no existe'} |`);
    if (r.brokenLinks.length > 100) L.push(`| … | ${r.brokenLinks.length - 100} más en audit.json | |`);
  }
  if (r.unresolved.length) {
    const byReason = new Map();
    for (const u of r.unresolved) byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
    L.push('');
    L.push(`Enlaces no verificables (${r.unresolved.length}): ${[...byReason.entries()].map(([k, n]) => `${k} (${n})`).join('; ')}. Se listan en audit.json → \`unresolved\`.`);
  }
  L.push('');

  // 4. Imágenes
  L.push('## Imágenes');
  L.push('');
  L.push(`${plural(s.imagesTotal, 'imagen inventariada', 'imágenes inventariadas')}${s.imagesWithBytes ? ` (${s.imagesWithBytes} con peso conocido)` : ' (sin datos de peso: el inventario no incluye bytes)'}.`);
  L.push('');
  if (r.heavyImages.length) {
    L.push(`Más de 300 KB (${r.heavyImages.length}):`);
    L.push('');
    L.push('| Página | Imagen | Peso |');
    L.push('|---|---|---|');
    for (const h of r.heavyImages.slice(0, 50)) L.push(`| ${mdCell(pathOf(h.page))} | ${mdCell(h.src)} | ${fmtBytes(h.bytes)} |`);
    L.push('');
  } else {
    L.push(s.imagesWithBytes ? 'Ninguna imagen supera los 300 KB.' : 'No se pudo evaluar el peso (> 300 KB) de las imágenes.');
    L.push('');
  }
  if (r.imagesNoDimensions.length) {
    const pagesAffected = new Set(r.imagesNoDimensions.map((i) => i.page)).size;
    L.push(`Sin \`width\`/\`height\` (${r.imagesNoDimensions.length} en ${plural(pagesAffected, 'página', 'páginas')}): provocan saltos de maquetación (CLS). Ejemplos:`);
    L.push('');
    for (const i of r.imagesNoDimensions.slice(0, 10)) L.push(`- \`${pathOf(i.page)}\` → ${i.src}`);
    L.push('');
  } else {
    L.push('Todas las imágenes declaran ancho y alto.');
    L.push('');
  }
  const noAlt = r.pages.flatMap((p) => p.errors.filter((f) => f.code === 'img-alt').map((f) => ({ page: p.url, msg: f.msg })));
  if (noAlt.length) {
    L.push(`Sin texto alternativo (${noAlt.length}): afecta a accesibilidad y a Google Imágenes.`);
    L.push('');
  }

  // 5. Seguridad y rastreo
  L.push('## Seguridad y rastreo');
  L.push('');
  if (r.security.localOrigin) {
    L.push(`- **HTTPS**: no aplica (origen local \`${r.source.origin}\`; el inventario proviene de una carpeta o entorno de pruebas).`);
  } else if (r.security.https === true) {
    L.push('- **HTTPS**: sí.');
  } else if (r.security.https === false) {
    L.push('- **HTTPS**: **no**. El sitio se sirve por HTTP; los navegadores lo marcan como «No seguro».');
  } else {
    L.push('- **HTTPS**: no disponible (sin origen).');
  }
  if (r.security.https === true) {
    if (r.security.mixedContent.length) {
      L.push(`- **Contenido mixto**: ${r.security.mixedContent.length} recursos por HTTP. Ejemplos: ${r.security.mixedContent.slice(0, 3).map((m) => `\`${m.src}\``).join(', ')}.`);
    } else {
      L.push('- **Contenido mixto**: no detectado.');
    }
  }
  if (r.security.robots.available) {
    const rb = r.security.robots;
    L.push(`- **robots.txt** (${rb.source}): ${plural(rb.groups, 'grupo', 'grupos')}; ${rb.disallowAll ? '**bloquea todo el sitio para todos los bots**' : rb.disallowed.length ? `bloquea ${rb.disallowed.map((d) => `\`${d}\``).join(', ')}` : 'sin bloqueos'}; ${rb.sitemaps.length ? `declara ${plural(rb.sitemaps.length, 'sitemap', 'sitemaps')}` : 'no declara Sitemap:'}.`);
  } else {
    L.push('- **robots.txt**: no disponible (el inventario no lo incluye y no se pudo descargar del origen).');
  }
  if (r.security.sitemap.available) {
    const sm = r.security.sitemap;
    L.push(`- **sitemap.xml** (${sm.source}): ${sm.isIndex ? `índice con ${sm.urls} sitemaps` : `${sm.urls} URL${sm.notInInventory ? `, ${sm.notInInventory} no aparecen en el inventario` : ''}`}.`);
  } else {
    L.push('- **sitemap.xml**: no disponible.');
  }
  if (r.aiCrawlers.source) {
    L.push(`- **Rastreadores de IA** (según ${r.aiCrawlers.source}): bloqueados → ${r.aiCrawlers.blocked.length ? r.aiCrawlers.blocked.join(', ') : 'ninguno'}; permitidos → ${r.aiCrawlers.allowed.length ? r.aiCrawlers.allowed.join(', ') : 'ninguno'}.`);
  } else {
    L.push('- **Rastreadores de IA**: no disponible (sin robots.txt). La política de IA se decidirá en el brief del nuevo sitio.');
  }
  if (r.jsOnly.length) {
    L.push(`- **Páginas solo-JS** (${r.jsOnly.length}): ${r.jsOnly.slice(0, 5).map((u) => `\`${pathOf(u)}\``).join(', ')}${r.jsOnly.length > 5 ? '…' : ''}. Su contenido no se ve sin ejecutar JavaScript.`);
  }
  L.push('');

  // 6. Contenido duplicado
  L.push('## Contenido duplicado');
  L.push('');
  if (!r.duplicates.length) {
    L.push('No hay páginas con contenido idéntico.');
  } else {
    L.push(`${plural(r.duplicates.length, 'grupo', 'grupos')} de páginas con el mismo contenido principal. En la migración se conserva una URL por grupo y el resto redirige (301) a ella.`);
    L.push('');
    for (const d of r.duplicates) {
      L.push(`- \`${d.contentHash.slice(0, 8)}\`: ${d.urls.map((u) => `\`${pathOf(u)}\``).join(' = ')}`);
    }
  }
  L.push('');

  // 7. Lighthouse (solo con --lighthouse)
  if (r.lighthouse !== undefined) {
    L.push('## Lighthouse (móvil)');
    L.push('');
    if (!r.lighthouse.length) {
      L.push('no ejecutado: el inventario no tiene páginas.');
    } else if (r.lighthouse.every((x) => x.error)) {
      L.push(`no ejecutado: ${r.lighthouse[0].error}`);
    } else {
      L.push(`Top ${r.lighthouse.length} páginas por enlaces entrantes (puntuaciones 0–100; LCP en ms; CLS sin unidad).`);
      L.push('');
      L.push('| Página | Perf | A11y | BP | SEO | LCP | CLS |');
      L.push('|---|---|---|---|---|---|---|');
      for (const x of r.lighthouse) {
        if (x.error) L.push(`| ${mdCell(pathOf(x.url))} | no ejecutado: ${mdCell(x.error)} | | | | | |`);
        else L.push(`| ${mdCell(pathOf(x.url))} | ${x.perf ?? '—'} | ${x.a11y ?? '—'} | ${x.bp ?? '—'} | ${x.seo ?? '—'} | ${x.lcp ?? '—'} | ${x.cls ?? '—'} |`);
      }
    }
    L.push('');
  }

  // 8. Stack y riesgos
  L.push('## Stack y riesgos');
  L.push('');
  const stackLabel = r.stack.detected ? (STACK_SIGNATURES.find((x) => x.id === r.stack.detected)?.label ?? r.stack.detected) : 'no identificado';
  L.push(`Tecnología: **${stackLabel}**${r.stack.declared ? ` (inventario: \`${r.stack.declared}\`)` : ''}.`);
  if (r.stack.signals.length) L.push(`Señales: ${r.stack.signals.join('; ')}.`);
  if (r.stack.libraries.length) L.push(`Librerías y servicios detectados: ${r.stack.libraries.join(', ')}.`);
  L.push('');
  if (r.stack.risks.length) {
    L.push('Riesgos:');
    L.push('');
    for (const risk of r.stack.risks) L.push(`- ${risk}`);
  } else {
    L.push('Sin riesgos específicos del stack identificados; aplican los hallazgos SEO anteriores.');
  }
  L.push('');

  // 9. Qué cambia con la migración
  L.push('## Qué cambia con la migración');
  L.push('');
  L.push('- **Metadatos completos en el 100 % de las páginas**: título, descripción, canónica, H1 único, Open Graph y JSON-LD se generan desde la plantilla; los fallos de la tabla anterior desaparecen.');
  if (s.broken || s.errorPages) L.push(`- **Cero enlaces rotos**: ${s.broken + s.errorPages} destinos con error se redirigen (301) o se eliminan; \`check-redirects\` verifica que ninguna URL antigua quede huérfana.`);
  else L.push('- **Paridad de URLs**: cada URL antigua termina en una página del nuevo sitio o en una redirección 301 verificada.');
  if (s.duplicates) L.push(`- **Sin duplicados**: ${s.duplicates === 1 ? '1 grupo se consolida' : `${s.duplicates} grupos se consolidan`} en una URL por grupo, con redirecciones.`);
  L.push('- **Imágenes optimizadas**: formatos modernos (AVIF/WebP), dimensiones declaradas y carga diferida salvo la imagen principal; sin saltos de maquetación.');
  L.push('- **HTTPS, cabeceras de seguridad y sin contenido mixto** desde el primer despliegue; robots.txt y sitemap generados automáticamente.');
  L.push('- **Política de IA explícita** (permitir o bloquear GPTBot, ClaudeBot, PerplexityBot, etc.) decidida en el brief y aplicada en robots.txt.');
  L.push('- **Sitio estático sin CMS que mantener**: sin plugins que actualizar ni base de datos expuesta; rendimiento móvil alto por diseño.');
  if (s.jsOnly) L.push(`- **Contenido visible sin JavaScript**: las ${s.jsOnly} páginas solo-JS pasan a HTML indexable.`);
  L.push('');
  L.push('Siguiente paso: extraer el contenido (`extract-content.mjs`), confirmar el brief y planificar las redirecciones (`plan-redirects.mjs`).');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `audit-site.mjs — auditoría técnica/SEO de un sitio a partir de su inventory.json

Uso:
  node audit-site.mjs <inventory.json> --out <dir> [--lighthouse] [--json]

Opciones:
  --out <dir>     Carpeta de salida (audit.md + audit.json). Obligatoria.
  --lighthouse    Ejecuta Lighthouse móvil (npx -y lighthouse) sobre las 5 páginas con más enlaces entrantes.
                  Solo con inventarios de URL pública; si falla o no hay Chrome, se anota "no ejecutado".
  --no-fetch      No descargar robots.txt/sitemap.xml del origen (se usan solo los de raw/ si existen).
  --json          Imprime audit.json en stdout.
  --help          Esta ayuda.

Enlaces rotos: destino con status ≥ 400 o, en inventarios de carpeta/repo, destino ausente del inventario
(las rutas dinámicas del CMS como /tag/ o /author/ se listan como no verificables).
Windows + Git Bash: pasa rutas sin barra inicial o usa MSYS_NO_PATHCONV=1.
`;

function parseArgs(argv) {
  const opts = { input: null, out: null, lighthouse: false, json: false, help: false, fetch: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--lighthouse') opts.lighthouse = true;
    else if (a === '--no-fetch') opts.fetch = false;
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else if (!opts.input) opts.input = a;
    else throw new Error(`Argumento inesperado: ${a}`);
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    console.error(HELP);
    process.exit(1);
  }
  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!opts.input || !opts.out) {
    console.error('Error: se requieren <inventory.json> y --out <dir>\n');
    console.error(HELP);
    process.exit(1);
  }
  try {
    const file = resolve(opts.input);
    if (!existsSync(file)) throw new Error(`No existe el inventario: ${opts.input}`);
    let inv;
    try {
      inv = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`inventory.json ilegible: ${err.message}`);
    }
    const result = await audit(inv, {
      inventoryDir: dirname(file),
      out: opts.out,
      lighthouse: opts.lighthouse,
      fetch: opts.fetch,
      log: opts.json ? () => {} : (m) => console.error(`  ${m}`),
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const s = result.summary;
      console.log(
        `Auditoría: ${s.pages} páginas · ${s.errors} errores · ${s.warnings} advertencias · ${s.broken} enlaces rotos · ${s.duplicates} duplicados · ${s.heavyImages} imágenes pesadas · ${s.jsOnly} solo-JS → ${join(opts.out, 'audit.md')}`,
      );
      if (result.lighthouse?.length && result.lighthouse.every((x) => x.error)) console.log(`  lighthouse no ejecutado: ${result.lighthouse[0].error}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
