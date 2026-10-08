#!/usr/bin/env node
/**
 * check-seo.mjs — auditoría SEO técnica de un `dist/` estático (Astro u otro).
 *
 * Uso:  node check-seo.mjs <dist-dir> [--site https://dominio.com] [--redirects <redirects.json|vercel.json>] [--json]
 *
 * Node >= 22, ESM, cero dependencias. Solo regex/parsing simple (sin DOM).
 * Revisa cada *.html y, a nivel de sitio, robots.txt + sitemap.
 * Enlaces internos: todo `<a href="/…">` raíz-relativo debe resolver a un archivo del dist (`/x/` → `x/index.html`,
 * `/x` → `x/index.html` o `x.html`, rutas con extensión → el archivo) o, con --redirects, a un origen de redirect
 * (`redirects.json` de plan-redirects `[{from}]` o `vercel.json` `{redirects:[{source}]}`); si no → error `link-broken`.
 * Sale con código 1 si hay errores; las advertencias no bloquean.
 *
 * Doctrina: ../references/seo.md
 *
 * Exporta `auditHtml(html, {url, site, route, is404})` → `{errors:[{code,msg}], warnings:[...], info:[...]}`
 * para que otros scripts (p. ej. migrate/audit-site.mjs) reutilicen las comprobaciones por página.
 * La CLI solo se ejecuta cuando el archivo es el módulo principal.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Utilidades de parsing (sin DOM)
// ---------------------------------------------------------------------------

/** Decodifica las entidades HTML más comunes. */
function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Devuelve el valor de un atributo dentro de la cadena de un tag abierto. */
function attr(tag, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return decode(m[1] ?? m[2] ?? m[3] ?? '');
}

/** ¿El atributo existe (aunque sea vacío)? */
function hasAttr(tag, name) {
  return new RegExp(`\\s${name}(?:\\s*=|\\s|/|>)`, 'i').test(tag + '>');
}

/** Todos los tags abiertos de un nombre dado. */
function tags(html, name) {
  const re = new RegExp(`<${name}(?=[\\s/>])[^>]*>`, 'gi');
  return html.match(re) ?? [];
}

/** Elimina bloques que no deben contar (svg, comentarios, scripts, templates). */
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '')
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
}

function metaContent(html, attrName, attrValue) {
  const out = [];
  for (const t of tags(html, 'meta')) {
    const v = attr(t, attrName);
    if (v && v.toLowerCase() === attrValue.toLowerCase()) out.push(attr(t, 'content') ?? '');
  }
  return out;
}

function textLen(s) {
  return [...s.trim().replace(/\s+/g, ' ')].length;
}

/** Ruta pública esperada de un archivo HTML del dist (`/`, `/contacto/`, `/x.html`). */
function routeOf(relPath) {
  const posix = relPath.split(sep).join('/');
  if (posix === 'index.html') return '/';
  if (posix.endsWith('/index.html')) return '/' + posix.slice(0, -'index.html'.length);
  return '/' + posix;
}

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, acc);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Comprobaciones por página (reutilizables)
// ---------------------------------------------------------------------------

/** Ruta pública a partir de una URL absoluta (`https://x.com/a/` → `/a/`). */
function routeFromUrl(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return null;
  }
}

/**
 * Audita el HTML de una página. No toca el disco ni el proceso.
 * @param {string} raw HTML completo
 * @param {{url?: string|null, site?: string|null, route?: string|null, is404?: boolean}} [opts]
 *   - `site`: origen esperado (sin barra final) para validar canonical/og:image.
 *   - `route`: ruta pública de la página (`/`, `/contacto/`); si falta se deriva de `url`.
 *   - `is404`: la página es la 404 del sitio (relaja canonical, exige noindex).
 * @returns {{errors: {code: string, msg: string}[], warnings: {code: string, msg: string}[], info: {code: string, msg: string}[]}}
 */
export function auditHtml(raw, { url = null, site = null, route = null, is404 = false } = {}) {
  const result = { errors: [], warnings: [], info: [] };
  const error = (code, msg) => result.errors.push({ code, msg });
  const warn = (code, msg) => result.warnings.push({ code, msg });
  const info = (code, msg) => result.info.push({ code, msg });

  if (site) site = String(site).replace(/\/+$/, '');
  if (!route && url) route = routeFromUrl(url);

  const html = stripNoise(String(raw ?? ''));
  const headMatch = html.match(/<head(?=[\s>])[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html;

  // <html lang>
  const htmlTag = tags(html, 'html')[0];
  const lang = htmlTag ? attr(htmlTag, 'lang') : null;
  if (!lang) error('html-lang', 'Falta <html lang="…">');
  else if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) warn('html-lang', `lang="${lang}" no parece un código BCP 47 válido`);

  // <title>
  const titles = [...head.matchAll(/<title(?=[\s>])[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1]));
  if (titles.length !== 1) error('title', `Se esperaba exactamente un <title> en <head>; hay ${titles.length}`);
  if (titles.length >= 1) {
    const len = textLen(titles[0]);
    if (len < 10 || len > 65) warn('title-length', `<title> tiene ${len} caracteres (recomendado 10–65): "${titles[0].trim()}"`);
    if (/PLACEHOLDER/i.test(titles[0])) warn('placeholder', '<title> contiene PLACEHOLDER');
  }

  // meta description
  const descs = metaContent(head, 'name', 'description');
  if (descs.length !== 1) error('description', `Se esperaba exactamente una <meta name="description">; hay ${descs.length}`);
  if (descs.length >= 1) {
    const len = textLen(descs[0]);
    if (len < 50 || len > 160) warn('description-length', `meta description tiene ${len} caracteres (recomendado 50–160)`);
    if (/PLACEHOLDER/i.test(descs[0])) warn('placeholder', 'meta description contiene PLACEHOLDER');
  }

  // robots / noindex
  const robots = metaContent(head, 'name', 'robots').join(',').toLowerCase();
  const noindex = robots.includes('noindex');
  if (is404 && !noindex) error('404-noindex', '404.html debe llevar <meta name="robots" content="noindex…">');
  if (!is404 && noindex) info('noindex', 'Página con noindex (correcto si es intencional; excluirla del sitemap)');

  // <h1>
  const h1s = tags(html, 'h1');
  if (h1s.length !== 1) error('h1', `Se esperaba exactamente un <h1>; hay ${h1s.length}`);

  // canonical
  const canonicals = tags(head, 'link').filter((t) => (attr(t, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  if (canonicals.length === 0) {
    if (is404) info('canonical', 'Sin canonical (aceptable en 404 con noindex)');
    else error('canonical', 'Falta <link rel="canonical">');
  } else if (canonicals.length > 1) {
    error('canonical', `Hay ${canonicals.length} canonical; debe haber una`);
  } else {
    const href = attr(canonicals[0], 'href') ?? '';
    if (!/^https?:\/\/[^/]+/i.test(href)) error('canonical-absolute', `canonical no es absoluta: "${href}"`);
    else if (site && route && !is404) {
      const norm = (u) => u.replace(/\/+$/, '').toLowerCase();
      const expected = site + route;
      if (!href.toLowerCase().startsWith(site.toLowerCase() + '/') && norm(href) !== norm(site)) {
        error('canonical-site', `canonical "${href}" no pertenece a --site ${site}`);
      } else if (norm(href) !== norm(expected)) {
        error('canonical-self', `canonical "${href}" no coincide con la ruta del archivo (${expected})`);
      }
    }
  }

  // Open Graph / Twitter
  const ogTitle = metaContent(head, 'property', 'og:title');
  const ogDesc = metaContent(head, 'property', 'og:description');
  const ogImage = metaContent(head, 'property', 'og:image');
  const twCard = metaContent(head, 'name', 'twitter:card');
  if (ogTitle.length !== 1) error('og:title', `og:title: hay ${ogTitle.length}, se esperaba 1`);
  if (ogDesc.length !== 1) error('og:description', `og:description: hay ${ogDesc.length}, se esperaba 1`);
  if (ogImage.length === 0) error('og:image', 'Falta og:image');
  else {
    const img = ogImage[0];
    if (!/^https?:\/\//i.test(img)) error('og:image', `og:image debe ser URL absoluta: "${img}"`);
    if (/\.svg(\?|$)/i.test(img)) warn('og:image-svg', 'og:image es SVG; la mayoría de scrapers sociales requieren PNG/JPG 1200x630');
    if (site && /^https?:\/\//i.test(img) && !img.toLowerCase().startsWith(site.toLowerCase())) info('og:image-host', `og:image en otro host: ${img}`);
  }
  if (twCard.length !== 1) error('twitter:card', `twitter:card: hay ${twCard.length}, se esperaba 1`);
  else if (!/^(summary|summary_large_image|player|app)$/.test(twCard[0])) warn('twitter:card', `twitter:card con valor inusual "${twCard[0]}"`);

  // JSON-LD
  const ldBlocks = [...String(raw ?? '').matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const seenTypes = [];
  ldBlocks.forEach((m, i) => {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch (e) {
      error('jsonld-parse', `Bloque JSON-LD #${i + 1} no parsea: ${e.message}`);
      return;
    }
    const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
    const rootHasContext = Boolean(data['@context']) || (Array.isArray(data) && data.every((n) => n && n['@context']));
    if (!rootHasContext) error('jsonld-context', `Bloque JSON-LD #${i + 1} sin @context`);
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const type = node['@type'];
      if (!type) {
        error('jsonld-type', `Bloque JSON-LD #${i + 1} sin @type`);
        continue;
      }
      const typeList = Array.isArray(type) ? type : [type];
      seenTypes.push(...typeList);
      for (const t of typeList) {
        if (/^(FAQPage|HowTo)$/i.test(t)) warn('jsonld-retired', `@type ${t}: rich result retirado por Google (FAQ 2026-05, HowTo 2023); eliminar`);
        if (/^(AggregateRating|Review)$/i.test(t)) warn('jsonld-review', `@type ${t}: solo con reseñas reales de primera parte`);
      }
      if (/^(Article|BlogPosting|NewsArticle)$/.test(typeList[0]) && !node.author) warn('jsonld-author', `${typeList[0]} sin author (E-E-A-T)`);
      if (/^(Article|BlogPosting|NewsArticle)$/.test(typeList[0]) && !node.datePublished) warn('jsonld-date', `${typeList[0]} sin datePublished`);
    }
  });
  if (seenTypes.length) info('jsonld', `JSON-LD: ${seenTypes.join(', ')}`);

  // Imágenes
  const mainMatch = html.match(/<main(?=[\s>])[^>]*>([\s\S]*?)<\/main>/i);
  const main = mainMatch ? mainMatch[1] : null;
  const allImgs = tags(html, 'img');
  if (main) {
    const firstImg = tags(main, 'img')[0];
    if (firstImg && (attr(firstImg, 'loading') ?? '').toLowerCase() === 'lazy') {
      error('lcp-lazy', `La primera <img> dentro de <main> lleva loading="lazy" (candidata LCP; usar eager + fetchpriority="high")`);
    }
  } else if (allImgs.length) {
    info('main', 'Sin <main>; no se puede identificar la imagen LCP');
  }
  allImgs.forEach((t) => {
    const loading = (attr(t, 'loading') ?? '').toLowerCase();
    const fp = (attr(t, 'fetchpriority') ?? '').toLowerCase();
    const src = attr(t, 'src') ?? '(sin src)';
    if (fp === 'high' && loading === 'lazy') error('lcp-lazy', `<img fetchpriority="high"> con loading="lazy": ${src}`);
    if (!hasAttr(t, 'alt')) error('img-alt', `<img> sin atributo alt: ${src}`);
    if (!hasAttr(t, 'width') || !hasAttr(t, 'height')) warn('img-dimensions', `<img> sin width/height (riesgo CLS): ${src}`);
  });

  // Enlaces internos
  for (const a of tags(html, 'a')) {
    const href = attr(a, 'href');
    if (!href) continue;
    if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    const internal = href.startsWith('/') || (site && href.toLowerCase().startsWith(site.toLowerCase()));
    if (!internal) continue;
    const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    if (/\.html?$/i.test(path) && !/\/404\.html$/.test(path)) error('link-html', `Enlace interno con extensión .html: ${href}`);
    if (/\/\//.test(path)) error('link-double-slash', `Enlace interno con doble barra: ${href}`);
  }

  if (/<meta[^>]+name\s*=\s*["']keywords["']/i.test(head)) info('meta-keywords', 'meta keywords presente: ignorada por buscadores; se puede eliminar');

  return result;
}

/**
 * Enlaces internos raíz-relativos de una página (`/x/`, `/x`, `/doc.pdf`), sin query ni fragmento y sin
 * duplicados. Ignora `//host/...` (protocol-relative) y esquemas.
 * @param {string} raw HTML completo
 * @returns {string[]}
 */
export function internalLinkPaths(raw) {
  const html = stripNoise(String(raw ?? ''));
  const out = new Set();
  for (const a of tags(html, 'a')) {
    const href = attr(a, 'href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) continue;
    const path = href.split(/[?#]/)[0];
    if (path) out.add(path);
  }
  return [...out];
}

/** ¿Existe en `distDir` un archivo que sirva `path`? (`/x/` → x/index.html; `/x` → x/index.html | x.html; `/a.pdf` → a.pdf). */
export function distServes(distDir, path) {
  let p;
  try {
    p = decodeURIComponent(path);
  } catch {
    p = path;
  }
  const segments = p.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  const candidates = [];
  if (p.endsWith('/') || segments.length === 0) {
    candidates.push(join(distDir, ...segments, 'index.html'));
  } else if (/\.[a-z0-9]{1,8}$/i.test(last)) {
    candidates.push(join(distDir, ...segments));
  } else {
    candidates.push(join(distDir, ...segments, 'index.html'));
    candidates.push(join(distDir, ...segments.slice(0, -1), `${last}.html`));
  }
  return candidates.some((f) => {
    try {
      return existsSync(f) && statSync(f).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Orígenes de redirect de un `redirects.json` (plan-redirects: `[{from}]`) o un `vercel.json` (`{redirects:[{source}]}`).
 * Rutas normalizadas con barra final cuando no tienen extensión. Los `source` con patrones (`:slug`, `(.*)`) se omiten.
 * @param {string} file
 * @returns {Set<string>}
 */
export function loadRedirectSources(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(data) ? data : Array.isArray(data?.redirects) ? data.redirects : null;
  if (!list) throw new Error(`${file} no es un redirects.json ([{from}]) ni un vercel.json ({redirects:[{source}]})`);
  const out = new Set();
  for (const r of list) {
    const from = typeof r?.from === 'string' ? r.from : typeof r?.source === 'string' ? r.source : null;
    if (!from || /[:*()]/.test(from)) continue;
    out.add(normalizeLinkPath(from));
  }
  return out;
}

/** `/x` y `/x/` se comparan igual cuando no hay extensión. */
function normalizeLinkPath(path) {
  const p = path.split(/[?#]/)[0];
  const last = p.slice(p.lastIndexOf('/') + 1);
  return !p.endsWith('/') && !/\.[a-z0-9]{1,8}$/i.test(last) ? `${p}/` : p;
}

/** Audita un archivo del dist y vuelca los hallazgos en `findings` con la ruta relativa como `file`. */
function checkPage(absPath, { distDir, site, findings, redirectSources = null }) {
  const rel = relative(distDir, absPath);
  const raw = readFileSync(absPath, 'utf8');
  const is404 = /(^|\/)404\.html$/.test(rel.split(sep).join('/'));
  const r = auditHtml(raw, { site, route: routeOf(rel), is404 });
  for (const f of r.errors) findings.push({ level: 'error', file: rel, check: f.code, message: f.msg });
  for (const f of r.warnings) findings.push({ level: 'warn', file: rel, check: f.code, message: f.msg });
  for (const f of r.info) findings.push({ level: 'info', file: rel, check: f.code, message: f.msg });

  // Enlaces internos: deben existir en dist o ser origen de un redirect declarado (--redirects).
  for (const path of internalLinkPaths(raw)) {
    if (distServes(distDir, path)) continue;
    if (redirectSources?.has(normalizeLinkPath(path))) continue;
    findings.push({
      level: 'error',
      file: rel,
      check: 'link-broken',
      message: `Enlace interno sin destino en dist${redirectSources ? ' ni en --redirects' : ''}: ${path}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Comprobaciones de sitio
// ---------------------------------------------------------------------------

function checkSite({ distDir, site, findings }) {
  const add = (level, file, check, message) => findings.push({ level, file, check, message });
  const error = (f, c, m) => add('error', f, c, m);
  const warn = (f, c, m) => add('warn', f, c, m);
  const info = (f, c, m) => add('info', f, c, m);

  const robotsPath = join(distDir, 'robots.txt');
  if (!existsSync(robotsPath)) {
    error('robots.txt', 'robots', 'No existe robots.txt en dist');
  } else {
    const txt = readFileSync(robotsPath, 'utf8');
    const sitemapLines = txt.split(/\r?\n/).filter((l) => /^\s*sitemap\s*:/i.test(l));
    if (sitemapLines.length === 0) error('robots.txt', 'robots-sitemap', 'robots.txt sin directiva "Sitemap:"');
    for (const l of sitemapLines) {
      const url = l.split(/:\s*/).slice(1).join(':').trim();
      if (!/^https?:\/\//i.test(url)) error('robots.txt', 'robots-sitemap', `Sitemap: debe ser URL absoluta: "${url}"`);
      else if (site && !url.toLowerCase().startsWith(site.toLowerCase() + '/')) error('robots.txt', 'robots-sitemap', `Sitemap: "${url}" no pertenece a --site ${site}`);
      if (/example\.com/i.test(url)) warn('robots.txt', 'placeholder', `Sitemap: apunta a example.com: "${url}"`);
    }
    // Evaluar por grupo (bloques separados por línea en blanco) para no cruzar reglas de distintos agentes.
    for (const block of txt.split(/\r?\n\s*\r?\n/)) {
      const isStar = /^\s*user-agent\s*:\s*\*\s*$/im.test(block);
      const disallowAll = /^\s*disallow\s*:\s*\/\s*$/im.test(block);
      if (isStar && disallowAll) warn('robots.txt', 'robots-disallow-all', 'Grupo "User-agent: *" con "Disallow: /" — el sitio quedaría fuera de los buscadores');
    }
  }

  const sitemapIndex = join(distDir, 'sitemap-index.xml');
  const sitemap0 = join(distDir, 'sitemap-0.xml');
  const sitemapPlain = join(distDir, 'sitemap.xml');
  if (!existsSync(sitemapIndex) && !existsSync(sitemap0) && !existsSync(sitemapPlain)) {
    error('sitemap', 'sitemap', 'No existe sitemap-index.xml ni sitemap-0.xml (ni sitemap.xml) en dist');
  } else {
    const file = existsSync(sitemap0) ? sitemap0 : existsSync(sitemapPlain) ? sitemapPlain : sitemapIndex;
    const xml = readFileSync(file, 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
    info(relative(distDir, file), 'sitemap', `${locs.length} URL(s) en el sitemap`);
    if (site) {
      const bad = locs.filter((u) => !u.toLowerCase().startsWith(site.toLowerCase()));
      if (bad.length) error(relative(distDir, file), 'sitemap-site', `${bad.length} URL(s) del sitemap no pertenecen a --site (p. ej. ${bad[0]})`);
    }
    if (locs.some((u) => /\/404\/?$|\/404\.html$/.test(u))) warn(relative(distDir, file), 'sitemap-404', 'El sitemap incluye la 404');
  }

  if (!existsSync(join(distDir, '404.html'))) warn('404.html', '404', 'No existe dist/404.html; el host servirá una 404 genérica (o, peor, un 200 si hay rewrite catch-all)');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log('Uso: node check-seo.mjs <dist-dir> [--site https://dominio.com] [--redirects <redirects.json|vercel.json>] [--json]');
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const siteArgIdx = argv.indexOf('--site');
  let site = siteArgIdx !== -1 ? argv[siteArgIdx + 1] : null;
  const redirectsArgIdx = argv.indexOf('--redirects');
  const redirectsFile = redirectsArgIdx !== -1 ? argv[redirectsArgIdx + 1] : null;
  const valueIdx = new Set([siteArgIdx + 1, redirectsArgIdx + 1].filter((i) => i > 0));
  const distDir = argv.find((a, i) => !a.startsWith('--') && !valueIdx.has(i));
  const asJson = argv.includes('--json');

  if (!distDir || !existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`✗ Directorio no encontrado: ${distDir ?? '(vacío)'}`);
    process.exit(1);
  }
  if (site) {
    if (!/^https?:\/\//.test(site)) {
      console.error(`✗ --site debe ser una URL absoluta (recibido: ${site})`);
      process.exit(1);
    }
    site = site.replace(/\/+$/, '');
  }

  let redirectSources = null;
  if (redirectsFile) {
    if (!existsSync(redirectsFile)) {
      console.error(`✗ --redirects: archivo no encontrado: ${redirectsFile}`);
      process.exit(1);
    }
    try {
      redirectSources = loadRedirectSources(redirectsFile);
    } catch (err) {
      console.error(`✗ --redirects: ${err.message}`);
      process.exit(1);
    }
  }

  /** @type {{ level: 'error'|'warn'|'info', file: string, check: string, message: string }[]} */
  const findings = [];
  const ctx = { distDir, site, findings, redirectSources };

  const pages = walkHtml(distDir).sort();
  if (pages.length === 0) findings.push({ level: 'error', file: distDir, check: 'pages', message: 'No se encontró ningún .html en dist' });
  for (const p of pages) checkPage(p, ctx);
  checkSite(ctx);

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;

  if (asJson) {
    console.log(JSON.stringify({ dist: distDir, site, pages: pages.length, counts, findings }, null, 2));
  } else {
    const order = ['error', 'warn', 'info'];
    const label = { error: 'ERRORES', warn: 'ADVERTENCIAS', info: 'INFO' };
    const mark = { error: '✗', warn: '!', info: '·' };
    for (const level of order) {
      const items = findings.filter((f) => f.level === level);
      if (!items.length) continue;
      console.log(`\n${label[level]} (${items.length})`);
      for (const f of items) console.log(`  ${mark[level]} [${f.file}] ${f.check}: ${f.message}`);
    }
    console.log(`\nResumen: ${pages.length} página(s) · ${counts.error} error(es) · ${counts.warn} advertencia(s) · ${counts.info} info${site ? ` · site=${site}` : ''}`);
    console.log(counts.error ? 'Resultado: FALLÓ' : 'Resultado: OK');
  }

  process.exit(counts.error ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
