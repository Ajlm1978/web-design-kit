#!/usr/bin/env node
/**
 * crawl-site.mjs — rastrea un sitio público (mismo origen) y produce `inventory.json` + `raw/<sha1(url)>.html`.
 *
 * Node >= 22, ESM, cero dependencias. Playwright es opcional (solo con --render y si está instalado en el cwd).
 *
 * Uso:
 *   node crawl-site.mjs <url> --out <dir> [--max-pages 300] [--render] [--json] [--help]
 *
 * Comportamiento:
 * - UA `web-design-kit-migrate/1.0`; respeta robots.txt (grupo `web-design-kit-migrate` o `*`).
 *   Si robots.txt nos prohíbe la URL de inicio (p. ej. `Disallow: /`) → RobotsBlockedError, exit 1.
 * - Semillas: sitemap(s) (robots `Sitemap:` + /sitemap.xml, índices incluidos) + URL de inicio.
 * - BFS mismo origen con `normalizeUrl`; 2 req/s (500 ms entre peticiones); timeout 15 s por petición.
 * - Redirecciones: no se siguen a ciegas. Interna → `skipped {reason:'redirect', status, finalUrl}` y se encola
 *   el destino; externa → `skipped {reason:'external-redirect', status, finalUrl}` y no se rastrea.
 * - Content-type no HTML → `skipped {reason:'non-html'}`. Error de red/timeout → `skipped {reason:'error'}`.
 * - Páginas HTML (cualquier status, 404 incluido) → `pages[]` con metadatos y `raw/<sha1(url)>.html`.
 * - JS-only (wordCount < 40 y `id="root|__next|app"`, o host wixsite/squarespace): con --render y Playwright
 *   resoluble se renderiza (`rendered:true`); si no, la página se conserva tal cual y se anota
 *   `skipped {reason:'js-only'}`.
 *
 * Exporta: crawl(startUrl, opts), RobotsBlockedError, parseRobots, parseSitemap, isJsOnly, USER_AGENT.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { normalizeUrl } from './lib/url.mjs';
import { textOf, wordCount, mainContent } from './lib/html.mjs';
import { newInventory, pageFromHtml, rawFileName, writeInventory } from './lib/inventory.mjs';

export const USER_AGENT = 'web-design-kit-migrate/1.0';
const UA_TOKEN = 'web-design-kit-migrate';

const DEFAULTS = {
  maxPages: 300,
  delayMs: 500,
  timeoutMs: 15000,
  render: false,
  maxSitemaps: 50,
  renderTimeoutMs: 30000,
};

export class RobotsBlockedError extends Error {
  constructor(url, rule) {
    super(`robots.txt de ${new URL(url).origin} prohíbe rastrear ${new URL(url).pathname} (regla: ${rule})`);
    this.name = 'RobotsBlockedError';
    this.url = url;
    this.rule = rule;
  }
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

function robotsPatternToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const anchored = escaped.endsWith('\\$') ? `${escaped.slice(0, -2)}$` : escaped;
  return new RegExp(`^${anchored}`);
}

/**
 * Parsea robots.txt. Elige el grupo cuyo User-agent coincide con nuestro token; si no hay, `*`.
 * Precedencia: regla más larga gana; en empate, Allow.
 * @param {string} text
 * @param {string} [uaToken]
 * @returns {{isAllowed: (path: string) => boolean, blockingRule: (path: string) => string|null, sitemaps: string[]}}
 */
export function parseRobots(text, uaToken = UA_TOKEN) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasUa = false;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasUa || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasUa = true;
      continue;
    }
    lastWasUa = false;
    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if ((field === 'allow' || field === 'disallow') && current) {
      if (field === 'disallow' && value === '') continue; // Disallow vacío = permitir todo
      current.rules.push({ allow: field === 'allow', pattern: value, re: robotsPatternToRegExp(value), len: value.length });
    }
  }

  const token = uaToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const generic = groups.filter((g) => g.agents.includes('*'));
  const rules = (specific.length ? specific : generic).flatMap((g) => g.rules);

  const match = (path) => {
    let best = null;
    for (const r of rules) {
      if (!r.re.test(path)) continue;
      if (!best || r.len > best.len || (r.len === best.len && r.allow && !best.allow)) best = r;
    }
    return best;
  };

  return {
    isAllowed: (path) => {
      const best = match(path);
      return !best || best.allow;
    },
    blockingRule: (path) => {
      const best = match(path);
      return best && !best.allow ? `Disallow: ${best.pattern}` : null;
    },
    /** Rutas literales (sin comodines) bloqueadas para nosotros, p. ej. `/privado/`. */
    disallowed: rules.filter((r) => !r.allow && r.pattern !== '/' && !/[*$]/.test(r.pattern)).map((r) => r.pattern),
    sitemaps,
  };
}

// ---------------------------------------------------------------------------
// sitemaps
// ---------------------------------------------------------------------------

function stripWww(host) {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Rebasa una URL de sitemap al origen del rastreo: mismo origen → normaliza; mismo host (ignorando `www.`
 * y puerto) → reconstruye con el origen de inicio; otro host → null.
 */
function rebaseToOrigin(loc, origin) {
  let u;
  try {
    u = new URL(loc.trim());
  } catch {
    return null;
  }
  const o = new URL(origin);
  if (u.origin === o.origin) return normalizeUrl(u.href, origin);
  if (stripWww(u.hostname) === stripWww(o.hostname)) return normalizeUrl(u.pathname + u.search, origin);
  return null;
}

/**
 * @param {string} xml
 * @param {string} origin
 * @returns {{kind: 'urlset'|'sitemapindex', urls: string[], otherHosts: string[]}}
 *   `otherHosts`: hosts (únicos) de los `<loc>` descartados por no coincidir con el origen del rastreo.
 */
export function parseSitemap(xml, origin) {
  const src = String(xml ?? '');
  const kind = /<sitemapindex[\s>]/i.test(src) ? 'sitemapindex' : 'urlset';
  const urls = [];
  const seen = new Set();
  const otherHosts = new Set();
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const loc = m[1].replace(/&amp;/g, '&');
    const u = rebaseToOrigin(loc, origin);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    } else if (!u) {
      try {
        otherHosts.add(new URL(loc.trim()).host);
      } catch {
        /* <loc> ilegible */
      }
    }
  }
  return { kind, urls, otherHosts: [...otherHosts] };
}

// ---------------------------------------------------------------------------
// JS-only
// ---------------------------------------------------------------------------

const JS_ROOT_RE = /<(?:div|main|section|body)\b[^>]*\bid\s*=\s*["']?(?:root|__next|app)["'\s>]/i;
const JS_HOST_RE = /wixsite|squarespace/i;

/**
 * @param {string} html
 * @param {string} url
 */
export function isJsOnly(html, url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* sin host */
  }
  if (JS_HOST_RE.test(host)) return true;
  const words = wordCount(textOf(mainContent(html).html));
  return words < 40 && JS_ROOT_RE.test(String(html ?? ''));
}

// ---------------------------------------------------------------------------
// fetch con UA, timeout y redirecciones manuales
// ---------------------------------------------------------------------------

function isHtmlContentType(ct) {
  if (!ct) return true; // sin content-type: asumimos HTML
  return /^(text\/html|application\/xhtml\+xml)\b/i.test(ct.trim());
}

async function fetchRaw(url, { timeoutMs, readBody }) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = res.headers.get('content-type');
  const location = res.headers.get('location');
  let body = null;
  if (readBody(res.status, contentType)) body = await res.text();
  else await res.body?.cancel();
  return { status: res.status, contentType, location, body };
}

async function defaultImportPlaywright() {
  const req = createRequire(join(process.cwd(), '__wdk_resolve__.js'));
  let lastErr;
  for (const spec of ['playwright', '@playwright/test']) {
    try {
      return await import(pathToFileURL(req.resolve(spec)).href);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('playwright no resoluble');
}

// ---------------------------------------------------------------------------
// crawl
// ---------------------------------------------------------------------------

/**
 * @param {string} startUrl
 * @param {{out?: string, maxPages?: number, delayMs?: number, timeoutMs?: number, render?: boolean,
 *          quiet?: boolean, log?: (msg: string) => void, warn?: (msg: string) => void,
 *          importPlaywright?: () => Promise<any>}} [opts]
 * @returns {Promise<object>} Inventory
 */
export async function crawl(startUrl, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const log = o.quiet ? () => {} : (o.log ?? ((m) => process.stderr.write(`${m}\n`)));
  const warn = o.warn ?? ((m) => process.stderr.write(`AVISO: ${m}\n`));
  const importPlaywright = o.importPlaywright ?? defaultImportPlaywright;

  let start;
  try {
    start = new URL(startUrl);
  } catch {
    throw new Error(`URL inválida: ${startUrl}`);
  }
  if (start.protocol !== 'http:' && start.protocol !== 'https:') throw new Error(`Solo http(s): ${startUrl}`);
  const origin = start.origin;
  const startNorm = normalizeUrl(start.href, origin);

  const inv = newInventory({ kind: 'url', origin, stack: null });
  const t0 = Date.now();
  const rawDir = o.out ? join(o.out, 'raw') : null;
  if (rawDir) mkdirSync(rawDir, { recursive: true });

  // Rate limit: 1 petición cada delayMs.
  let lastRequestAt = 0;
  const throttle = async () => {
    const wait = lastRequestAt + o.delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  };
  const get = async (url, readBody) => {
    await throttle();
    return fetchRaw(url, { timeoutMs: o.timeoutMs, readBody });
  };

  // 1. robots.txt
  let robots = parseRobots('');
  try {
    const r = await get(`${origin}/robots.txt`, (status) => status >= 200 && status < 300);
    if (r.status >= 200 && r.status < 300 && r.body) robots = parseRobots(r.body);
  } catch (err) {
    log(`robots.txt no disponible (${err.message}); se asume permitido.`);
  }
  const blocking = robots.blockingRule(start.pathname + start.search);
  if (blocking) throw new RobotsBlockedError(start.href, blocking);

  // 2. semillas: sitemaps + URL de inicio
  const queue = [];
  const seen = new Set();
  const enqueue = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    queue.push(url);
  };
  enqueue(startNorm);

  // Rutas bloqueadas por robots.txt: se registran aunque nadie las enlace (la auditoría debe verlas).
  for (const pattern of robots.disallowed) {
    const url = normalizeUrl(pattern, origin);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    inv.skipped.push({ url, reason: 'robots', rule: `Disallow: ${pattern}` });
  }

  const sitemapSeeds = [`${origin}/sitemap.xml`, ...robots.sitemaps.map((s) => rebaseToOrigin(s, origin)).filter(Boolean)];
  const sitemapsSeen = new Set();
  const sitemapQueue = [...new Set(sitemapSeeds)];
  while (sitemapQueue.length && sitemapsSeen.size < o.maxSitemaps) {
    const sm = sitemapQueue.shift();
    if (sitemapsSeen.has(sm)) continue;
    sitemapsSeen.add(sm);
    try {
      const r = await get(sm, (status) => status >= 200 && status < 300);
      if (!(r.status >= 200 && r.status < 300) || !r.body) continue;
      const parsed = parseSitemap(r.body, origin);
      if (parsed.kind === 'sitemapindex') sitemapQueue.push(...parsed.urls);
      else for (const u of parsed.urls) enqueue(u);
      log(`sitemap ${sm}: ${parsed.urls.length} ${parsed.kind === 'sitemapindex' ? 'sitemaps' : 'URLs'}`);
      if (parsed.urls.length === 0 && parsed.otherHosts.length) {
        // H2-03: el sitemap existe pero todas sus URL son de otro host (IP vs dominio, alias, staging).
        const locCount = (r.body.match(/<loc>/gi) ?? []).length;
        const msg =
          `sitemap ${sm}: ${locCount} URL de otro host (${parsed.otherHosts.join(', ')}) y ninguna del origen rastreado (${start.host}); ` +
          `se ignoró. Si es el mismo sitio, rastrea con el host del sitemap: ${new URL(origin).protocol}//${parsed.otherHosts[0]}/`;
        inv.warnings.push(msg);
        warn(msg);
      }
    } catch (err) {
      log(`sitemap ${sm} no disponible (${err.message})`);
    }
  }

  // 3. Playwright perezoso (solo con --render)
  let browser = null;
  let playwrightUnavailable = false;
  const renderWith = async (url) => {
    if (playwrightUnavailable) return null;
    try {
      if (!browser) {
        const pw = await importPlaywright();
        const chromium = pw.chromium ?? pw.default?.chromium;
        if (!chromium) throw new Error('el módulo no exporta chromium');
        browser = await chromium.launch({ headless: true });
      }
      const page = await browser.newPage({ userAgent: USER_AGENT });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: o.renderTimeoutMs });
        return await page.content();
      } finally {
        await page.close();
      }
    } catch (err) {
      if (!browser) {
        playwrightUnavailable = true;
        warn(`--render: Playwright no está disponible desde ${process.cwd()} (${err.message}). Instálalo (npm i -D playwright && npx playwright install chromium) o continúa sin render: las páginas JS-only se anotan como skipped js-only.`);
      } else {
        warn(`--render falló en ${url}: ${err.message}`);
      }
      return null;
    }
  };

  // 4. BFS
  try {
    while (queue.length && inv.pages.length < o.maxPages) {
      const url = queue.shift();
      const path = new URL(url).pathname + new URL(url).search;
      const rule = robots.blockingRule(path);
      if (rule) {
        inv.skipped.push({ url, reason: 'robots', rule });
        continue;
      }

      let r;
      try {
        inv.stats.fetched++;
        r = await get(url, (status, ct) => !(status >= 300 && status < 400) && isHtmlContentType(ct));
      } catch (err) {
        inv.stats.errors++;
        inv.skipped.push({ url, reason: 'error', message: err.name === 'TimeoutError' ? `timeout ${o.timeoutMs} ms` : err.message });
        log(`ERROR ${url}: ${err.message}`);
        continue;
      }

      if (r.status >= 300 && r.status < 400 && r.location) {
        let absolute;
        try {
          absolute = new URL(r.location, url).href;
        } catch {
          absolute = r.location;
        }
        const internal = normalizeUrl(absolute, origin);
        if (internal) {
          inv.skipped.push({ url, reason: 'redirect', status: r.status, finalUrl: internal });
          enqueue(internal);
        } else {
          inv.skipped.push({ url, reason: 'external-redirect', status: r.status, finalUrl: absolute });
        }
        log(`${r.status} ${url} → ${absolute}`);
        continue;
      }

      if (!isHtmlContentType(r.contentType)) {
        inv.skipped.push({ url, reason: 'non-html', status: r.status, contentType: r.contentType });
        continue;
      }

      let html = r.body ?? '';
      let rendered = false;
      const ok = r.status >= 200 && r.status < 300;
      if (ok && isJsOnly(html, url)) {
        const renderedHtml = o.render ? await renderWith(url) : null;
        if (renderedHtml) {
          html = renderedHtml;
          rendered = true;
        } else {
          inv.skipped.push({ url, reason: 'js-only' });
        }
      }

      let rawFile = null;
      if (rawDir) {
        rawFile = `raw/${rawFileName(url)}`;
        writeFileSync(join(o.out, rawFile), html, 'utf8');
      }
      const page = pageFromHtml({ url, status: r.status, finalUrl: url, html, rawFile, rendered });
      inv.pages.push(page);
      log(`${r.status} ${url} (${page.wordCount} palabras)`);
      if (ok) for (const link of page.links) enqueue(link);
    }
    if (queue.length) warn(`--max-pages ${o.maxPages} alcanzado; quedan ${queue.length} URLs sin rastrear.`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  inv.stats.durationMs = Date.now() - t0;
  if (o.out) writeInventory(o.out, inv);
  return inv;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `Uso: node crawl-site.mjs <url> --out <dir> [--max-pages 300] [--render] [--json] [--help]

Rastrea un sitio (mismo origen) respetando robots.txt y escribe <out>/inventory.json y <out>/raw/<sha1(url)>.html.

Opciones:
  --out <dir>        Directorio de salida (obligatorio).
  --max-pages <n>    Máximo de páginas a inventariar (300).
  --render           Renderizar páginas JS-only con Playwright si está instalado en el cwd.
  --json             Imprimir el inventario en stdout.
  --delay-ms <n>     Espaciado entre peticiones (500 = 2 req/s).
  --timeout-ms <n>   Timeout por petición (15000).
  --help             Esta ayuda.

Salida: exit 0 si se inventarió al menos una página; exit 1 si robots.txt bloquea el sitio o hay un error fatal.
Antes de rastrear, confirma que eres dueño del sitio o tienes permiso escrito.`;

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        'max-pages': { type: 'string' },
        render: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
        'delay-ms': { type: 'string' },
        'timeout-ms': { type: 'string' },
      },
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n${HELP}\n`);
    return 1;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const url = positionals[0];
  if (!url || !values.out) {
    process.stderr.write(`Error: faltan <url> y/o --out <dir>.\n\n${HELP}\n`);
    return 1;
  }
  const num = (v, name, def) => {
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} debe ser un entero >= 0`);
    return n;
  };

  try {
    const inv = await crawl(url, {
      out: resolve(values.out),
      maxPages: num(values['max-pages'], '--max-pages', DEFAULTS.maxPages) || DEFAULTS.maxPages,
      delayMs: num(values['delay-ms'], '--delay-ms', DEFAULTS.delayMs),
      timeoutMs: num(values['timeout-ms'], '--timeout-ms', DEFAULTS.timeoutMs) || DEFAULTS.timeoutMs,
      render: values.render,
      quiet: values.json,
    });
    if (values.json) {
      process.stdout.write(`${JSON.stringify(inv, null, 2)}\n`);
    } else {
      const broken = inv.pages.filter((p) => p.status >= 400).length;
      const byReason = {};
      for (const s of inv.skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;
      process.stdout.write(
        [
          `Inventario escrito en ${join(resolve(values.out), 'inventory.json')}`,
          `Páginas: ${inv.pages.length} (${broken} con error HTTP) · peticiones: ${inv.stats.fetched} · errores de red: ${inv.stats.errors} · ${inv.stats.durationMs} ms`,
          `Omitidas: ${inv.skipped.length}${inv.skipped.length ? ` (${Object.entries(byReason).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}`,
          `Avisos: ${inv.warnings.length}`,
        ].join('\n') + '\n',
      );
    }
    if (inv.pages.length === 0) {
      process.stderr.write('Error: no se pudo inventariar ninguna página (revisa la URL, la red o robots.txt).\n');
      return 1;
    }
    return 0;
  } catch (err) {
    if (err instanceof RobotsBlockedError) {
      process.stderr.write(
        `Error: el robots.txt del sitio bloquea el rastreo (${err.rule}). ` +
          'No rastreamos sitios que lo prohíben: pide al dueño que permita el agente `web-design-kit-migrate` ' +
          'o usa --dir/--repo con una copia del sitio.\n',
      );
      return 1;
    }
    process.stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
