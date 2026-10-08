#!/usr/bin/env node
/**
 * scan-source.mjs — inventario de un sitio existente a partir de una carpeta, un export WXR o un repo git.
 *
 * Uso:
 *   node scan-source.mjs <dir|file.xml|repoUrl> --out <dir> [--build] [--base-url https://old.example.com] [--json] [--help]
 *
 * Escribe <out>/inventory.json (mismo formato que crawl-site.mjs, `source.kind: 'dir'|'repo'`) y
 * <out>/raw/<sha1(url)>.html con el HTML de cada página encontrada.
 *
 * Stacks detectados por marcadores: wxr · wordpress · static · astro · next · hugo · jekyll · spa · unknown.
 * - static: se recorren todos los *.html; la URL es la ruta relativa (index.html → /dir/).
 * - wxr: se parsean los <item> (page|post publicados); draft/private/attachment van a `skipped`.
 * - frameworks: se listan rutas por convención de archivos; con --build y script `build` en package.json,
 *   se ejecuta `npm run build` y se escanea dist|out|_site|build como estático. Nunca se construye sin --build.
 * - repo: `git clone --depth 1` a un directorio temporal y se escanea como carpeta.
 *
 * Seguridad: nunca se leen ni copian .env*, *.pem, *.key, id_rsa*; se registran en `warnings`.
 *
 * Cero dependencias. Node ≥ 22. Exit 1 en error fatal, 0 en informativo.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { normalizeUrl } from './lib/url.mjs';
import {
  contentHash,
  decodeEntities,
  extractImages,
  extractLinks,
  parseHead,
  textOf,
  wordCount,
} from './lib/html.mjs';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const STACKS = ['wxr', 'wordpress', 'static', 'astro', 'next', 'hugo', 'jekyll', 'spa', 'unknown'];

const DEFAULT_BASE_URL = 'http://localhost';
const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.cache', '.astro', '.next', '.vercel']);
const BUILD_OUTPUT_DIRS = ['dist', 'out', '_site', 'build'];
const REPO_PATTERN = /^(https?:\/\/|git@|[\w.-]+\/[\w.-]+$)/;

/** Nombres de archivo que indican credenciales: nunca se leen ni se copian. */
export function isCredentialFile(name) {
  const n = String(name);
  return (
    /^\.env(\..*)?$/i.test(n) ||
    /\.pem$/i.test(n) ||
    /\.key$/i.test(n) ||
    /^id_rsa/i.test(n) ||
    /^id_ed25519/i.test(n) ||
    /^id_ecdsa/i.test(n)
  );
}

// ---------------------------------------------------------------------------
// Inventario (misma forma que crawl-site.mjs)
// ---------------------------------------------------------------------------

function newInventory(source) {
  return {
    version: 1,
    source: {
      kind: source.kind,
      origin: source.origin,
      stack: source.stack ?? null,
      detectedAt: new Date().toISOString(),
      // Carpeta raíz escaneada (absoluta): extract-content la usa para copiar imágenes y leer CSS.
      root: source.root ?? null,
    },
    pages: [],
    skipped: [],
    stats: { fetched: 0, errors: 0, durationMs: 0 },
    warnings: [],
  };
}

function emptyPage(url) {
  return {
    url,
    status: null,
    finalUrl: url,
    title: null,
    description: null,
    canonical: null,
    h1: null,
    lang: null,
    wordCount: 0,
    links: [],
    images: [],
    jsonld: [],
    contentHash: null,
    rawFile: null,
    rendered: false,
  };
}

function firstH1(html) {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return null;
  const t = textOf(m[1]);
  return t || null;
}

function sha1(s) {
  return createHash('sha1').update(String(s), 'utf8').digest('hex');
}

/** Construye un Page a partir de HTML y guarda el raw en <out>/raw/<sha1(url)>.html. */
function pageFromHtml({ url, html, out }) {
  const head = parseHead(html);
  const text = textOf(html);
  const rawFile = `raw/${sha1(url)}.html`;
  if (out) {
    mkdirSync(join(out, 'raw'), { recursive: true });
    writeFileSync(join(out, rawFile), html, 'utf8');
  }
  return {
    ...emptyPage(url),
    status: 200,
    finalUrl: url,
    title: head.title,
    description: head.description,
    canonical: head.canonical,
    h1: firstH1(html),
    lang: head.lang,
    wordCount: wordCount(text),
    links: extractLinks(html, url),
    images: extractImages(html, url),
    jsonld: head.jsonld,
    contentHash: contentHash(text),
    rawFile,
    rendered: false,
  };
}

function writeInventory(out, inv) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'inventory.json'), JSON.stringify(inv, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Recorrido de archivos
// ---------------------------------------------------------------------------

/**
 * Recorre `root` recursivamente. Devuelve rutas absolutas de archivos regulares, omitiendo
 * directorios de herramientas y archivos de credenciales (estos últimos se anotan en `warnings`).
 */
function walk(root, { warnings = [], skipDirs = IGNORED_DIRS } = {}) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (isCredentialFile(e.name)) {
        warnings.push(`Se ignoró ${relative(root, full) || e.name}: posible credencial`);
        continue;
      }
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

function hasAny(dir, names) {
  return names.some((n) => existsSync(join(dir, n)));
}

function listTop(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Detección de stack
// ---------------------------------------------------------------------------

/**
 * Detecta el stack de una ruta (carpeta o archivo .xml) por marcadores. Nunca lee credenciales.
 * @param {string} input ruta absoluta
 * @returns {'wxr'|'wordpress'|'static'|'astro'|'next'|'hugo'|'jekyll'|'spa'|'unknown'}
 */
export function detectStack(input) {
  const st = statSync(input);
  if (st.isFile()) {
    if (/\.xml$/i.test(input)) {
      const head = readFileSync(input, 'utf8').slice(0, 64 * 1024);
      if (/xmlns:wp=/.test(head)) return 'wxr';
    }
    return 'unknown';
  }
  const top = listTop(input);
  if (top.some((n) => /^astro\.config\.(mjs|cjs|js|ts|mts)$/.test(n))) return 'astro';
  if (top.some((n) => /^next\.config\.(mjs|cjs|js|ts|mts)$/.test(n))) return 'next';
  if (top.some((n) => /^(hugo|config)\.(toml|yaml|yml|json)$/.test(n)) && hasAny(input, ['content'])) return 'hugo';
  if (top.includes('_config.yml') && hasAny(input, ['_posts', '_layouts', '_includes'])) return 'jekyll';
  if (top.includes('wp-content') || top.includes('wp-includes') || top.includes('wp-config.php')) return 'wordpress';
  if (
    top.includes('index.html') &&
    existsSync(join(input, 'src')) &&
    listTop(join(input, 'src')).some((n) => /^main\.(js|jsx|ts|tsx)$/.test(n))
  ) {
    return 'spa';
  }
  if (top.includes('_posts')) return 'jekyll';
  if (top.includes('content') && hasAny(input, ['layouts', 'archetypes', 'themes'])) return 'hugo';
  if (walk(input).some((f) => /\.html?$/i.test(f))) return 'static';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Static
// ---------------------------------------------------------------------------

function urlFromFile(root, file, origin) {
  const rel = relative(root, file).split(sep).join('/');
  const path = basename(rel) === 'index.html' || basename(rel) === 'index.htm' ? dirname(rel) : rel;
  const clean = path === '.' ? '' : path;
  return normalizeUrl('/' + clean + (clean && !/\.[a-z0-9]+$/i.test(clean) ? '/' : ''), origin) ?? `${origin}/${clean}`;
}

function scanStatic(root, inv, { out, origin }) {
  const files = walk(root, { warnings: inv.warnings });
  for (const file of files) {
    if (!/\.html?$/i.test(file)) continue;
    const url = urlFromFile(root, file, origin);
    try {
      const html = readFileSync(file, 'utf8');
      inv.pages.push(pageFromHtml({ url, html, out }));
    } catch (err) {
      inv.stats.errors++;
      inv.skipped.push({ url, reason: `error: ${err.message}` });
    }
  }
  inv.pages.sort((a, b) => a.url.localeCompare(b.url));
}

// ---------------------------------------------------------------------------
// WXR (WordPress eXtended RSS)
// ---------------------------------------------------------------------------

function xmlText(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return null;
  return unwrapCdata(m[1]);
}

function unwrapCdata(s) {
  const t = String(s ?? '').trim();
  const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(t);
  if (m) return m[1];
  return decodeEntities(t);
}

function xmlAll(block, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push({ attrs: m[1] ?? '', value: unwrapCdata(m[2]) });
  return out;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/**
 * Parsea un export WXR con una máquina de estados simple sobre <item>…</item>. Sin dependencias.
 * @param {string} xml
 * @returns {{origin: string|null, lang: string|null, items: object[]}}
 */
export function parseWxr(xml) {
  const src = String(xml);
  const channelHead = src.slice(0, src.indexOf('<item>') === -1 ? src.length : src.indexOf('<item>'));
  const origin =
    xmlText(channelHead, 'wp:base_site_url') ??
    xmlText(channelHead, 'wp:base_blog_url') ??
    xmlText(channelHead, 'link') ??
    null;
  const lang = xmlText(channelHead, 'language');

  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(src))) {
    const block = m[1];
    const categories = xmlAll(block, 'category');
    items.push({
      title: xmlText(block, 'title'),
      link: xmlText(block, 'link'),
      creator: xmlText(block, 'dc:creator'),
      content: xmlText(block, 'content:encoded') ?? '',
      excerpt: xmlText(block, 'excerpt:encoded'),
      postDate: xmlText(block, 'wp:post_date'),
      postName: xmlText(block, 'wp:post_name'),
      status: xmlText(block, 'wp:status'),
      postType: xmlText(block, 'wp:post_type'),
      tags: categories.map((c) => c.value).filter(Boolean),
      categories: categories.filter((c) => /domain="category"/.test(c.attrs)).map((c) => c.value),
      postTags: categories.filter((c) => /domain="post_tag"/.test(c.attrs)).map((c) => c.value),
    });
  }
  return { origin: origin ? origin.replace(/\/+$/, '') : null, lang, items };
}

function wxrDate(s) {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s.trim());
  return m ? `${m[1]}T${m[2]}` : s.trim();
}

function scanWxr(file, inv, { out }) {
  const xml = readFileSync(file, 'utf8');
  const { origin, lang, items } = parseWxr(xml);
  if (origin) inv.source.origin = origin;
  const base = inv.source.origin || DEFAULT_BASE_URL;

  for (const it of items) {
    const url = (it.link && normalizeUrl(it.link, base)) || (it.postName ? `${base}/${it.postName}/` : null);
    if (!url) {
      inv.skipped.push({ url: it.title ?? '(sin link)', reason: 'sin-url' });
      continue;
    }
    const type = (it.postType ?? '').toLowerCase();
    const status = (it.status ?? '').toLowerCase();
    if (type === 'attachment') {
      inv.skipped.push({ url, reason: 'attachment' });
      continue;
    }
    if (type !== 'page' && type !== 'post') {
      inv.skipped.push({ url, reason: `post_type:${type || 'desconocido'}` });
      continue;
    }
    if (status !== 'publish') {
      inv.skipped.push({ url, reason: status || 'sin-status' });
      continue;
    }
    const html =
      `<!doctype html>\n<html${lang ? ` lang="${escapeHtml(lang)}"` : ''}>\n<head>\n<meta charset="utf-8">\n` +
      `<title>${escapeHtml(it.title ?? '')}</title>\n` +
      (it.excerpt ? `<meta name="description" content="${escapeHtml(it.excerpt)}">\n` : '') +
      `<link rel="canonical" href="${escapeHtml(url)}">\n</head>\n<body>\n<article>\n${it.content}\n</article>\n</body>\n</html>\n`;
    const page = pageFromHtml({ url, html, out });
    page.type = type;
    page.date = wxrDate(it.postDate);
    page.author = it.creator ?? null;
    page.tags = it.tags;
    inv.pages.push(page);
  }
}

// ---------------------------------------------------------------------------
// Frameworks: rutas por convención
// ---------------------------------------------------------------------------

function routeFromRel(rel) {
  let p = rel.split(sep).join('/').replace(/\.[^./]+$/, '');
  if (/(^|\/)index$/.test(p)) p = p.replace(/(^|\/)index$/, '');
  p = p.replace(/^\/+|\/+$/g, '');
  return p ? `/${p}/` : '/';
}

function frontmatter(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function listRoutes(root, stack, warnings) {
  const files = walk(root, { warnings });
  const rel = (f) => relative(root, f);
  const routes = [];
  const dynamic = [];
  const add = (route, file, extra = {}) => {
    if (/[[\]*:]/.test(route)) dynamic.push({ route, file });
    else routes.push({ route, file, ...extra });
  };

  for (const f of files) {
    const r = rel(f);
    const parts = r.split(sep);
    const name = basename(r);
    if (stack === 'astro') {
      if (parts[0] !== 'src' || parts[1] !== 'pages') continue;
      if (!/\.(astro|md|mdx|html)$/.test(name) || name.startsWith('_') || parts.some((p) => p.startsWith('_')))
        continue;
      const fm = /\.mdx?$/.test(name) ? frontmatter(f) : {};
      add(routeFromRel(parts.slice(2).join(sep)), f, { title: fm.title ?? null, date: fm.date ?? null });
    } else if (stack === 'next') {
      if (parts[0] === 'app' || (parts[0] === 'src' && parts[1] === 'app')) {
        if (!/^page\.(js|jsx|ts|tsx|mdx?)$/.test(name)) continue;
        const inner = parts.slice(parts[0] === 'src' ? 2 : 1, -1).filter((p) => !/^\(.*\)$/.test(p));
        add(inner.length ? `/${inner.join('/')}/` : '/', f);
      } else if (parts[0] === 'pages' || (parts[0] === 'src' && parts[1] === 'pages')) {
        const inner = parts.slice(parts[0] === 'src' ? 2 : 1);
        if (inner[0] === 'api' || /^_/.test(inner[inner.length - 1])) continue;
        if (!/\.(js|jsx|ts|tsx|mdx?)$/.test(name)) continue;
        add(routeFromRel(inner.join(sep)), f);
      }
    } else if (stack === 'hugo') {
      if (parts[0] !== 'content' || !/\.(md|markdown|html)$/.test(name)) continue;
      const fm = frontmatter(f);
      if (/^(true|yes)$/i.test(fm.draft ?? '')) {
        dynamic.push({ route: routeFromRel(parts.slice(1).join(sep)), file: f, reason: 'draft' });
        continue;
      }
      const inner = parts.slice(1).join(sep).replace(/_index\.(md|markdown|html)$/, 'index.md');
      add(routeFromRel(inner), f, { title: fm.title ?? null, date: fm.date ?? null });
    } else if (stack === 'jekyll') {
      if (parts[0] === '_posts' && /\.(md|markdown|html)$/.test(name)) {
        const m = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.(md|markdown|html)$/.exec(name);
        const fm = frontmatter(f);
        if (m) {
          add(`/${m[1]}/${m[2]}/${m[3]}/${m[4]}/`, f, { title: fm.title ?? null, date: fm.date ?? `${m[1]}-${m[2]}-${m[3]}`, type: 'post' });
        }
      } else if (parts.length === 1 && /\.(md|markdown|html)$/.test(name) && !name.startsWith('_') && name !== 'README.md') {
        const fm = frontmatter(f);
        if (!fm.title && !fm.layout) continue;
        add(fm.permalink ? fm.permalink : routeFromRel(name), f, { title: fm.title ?? null, type: 'page' });
      }
    }
  }
  return { routes, dynamic };
}

function scanFramework(root, inv, { out, origin, build }) {
  const pkgPath = join(root, 'package.json');
  let buildScript = null;
  if (existsSync(pkgPath)) {
    try {
      buildScript = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts?.build ?? null;
    } catch {
      inv.warnings.push('package.json ilegible; se omite la detección de script build');
    }
  }

  if (build && buildScript) {
    const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) {
      inv.stats.errors++;
      inv.warnings.push(`npm run build terminó con código ${r.status ?? 'desconocido'}; se listan rutas por convención`);
    } else {
      const outDir = BUILD_OUTPUT_DIRS.map((d) => join(root, d)).find((d) => existsSync(d));
      if (outDir) {
        inv.warnings.push(`Construido con npm run build; se escaneó ${basename(outDir)}/ como HTML estático`);
        scanStatic(outDir, inv, { out, origin });
        return;
      }
      inv.warnings.push(`npm run build terminó pero no se encontró ${BUILD_OUTPUT_DIRS.join('|')}; se listan rutas por convención`);
    }
  } else if (buildScript && !build) {
    inv.warnings.push('package.json tiene script build: vuelve a ejecutar con --build para escanear la salida como HTML estático');
  }

  const { routes, dynamic } = listRoutes(root, inv.source.stack, inv.warnings);
  for (const r of routes) {
    const url = normalizeUrl(r.route, origin) ?? `${origin}${r.route}`;
    const page = emptyPage(url);
    page.title = r.title ?? null;
    if (r.type) page.type = r.type;
    if (r.date) page.date = r.date;
    page.sourceFile = relative(root, r.file).split(sep).join('/');
    inv.pages.push(page);
  }
  for (const d of dynamic) {
    inv.skipped.push({ url: `${origin}${d.route}`, reason: d.reason ?? 'ruta-dinamica' });
  }
  inv.pages.sort((a, b) => a.url.localeCompare(b.url));
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

export function isRepoRef(input) {
  if (existsSync(input)) return false;
  return REPO_PATTERN.test(input);
}

function repoUrl(ref) {
  if (/^(https?:\/\/|git@)/.test(ref)) return ref;
  return `https://github.com/${ref}.git`;
}

function cloneRepo(ref) {
  const url = repoUrl(ref);
  const dir = mkdtempSync(join(tmpdir(), 'wdk-repo-'));
  const r = spawnSync('git', ['clone', '--depth', '1', '--quiet', url, dir], { encoding: 'utf8' });
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`No se pudo clonar ${url}: ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return { dir, url };
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Escanea una carpeta, un export WXR o un repo y escribe <out>/inventory.json + raw/.
 * @param {string} input ruta local (carpeta o .xml) o referencia de repo (URL, git@, owner/repo)
 * @param {{out: string, build?: boolean, baseUrl?: string}} opts
 * @returns {Promise<object>} Inventory
 */
export async function scan(input, { out, build = false, baseUrl = DEFAULT_BASE_URL } = {}) {
  if (!out) throw new Error('Falta --out <dir>');
  const started = Date.now();
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error(`--base-url inválida: ${baseUrl}`);
  }

  let kind = 'dir';
  let root;
  let cloned = null;

  if (isRepoRef(input)) {
    kind = 'repo';
    cloned = cloneRepo(input);
    root = cloned.dir;
  } else {
    root = resolve(input);
    if (!existsSync(root)) throw new Error(`No existe la ruta: ${input}`);
  }

  try {
    const stack = detectStack(root);
    // `origin` es el origen URL de las páginas (WXR lo sobreescribe con el del export).
    // Para repos clonados en tmp, root deja de existir al terminar: se registra solo para dir.
    const inv = newInventory({ kind, origin, stack, root: cloned ? null : root });
    if (cloned) inv.warnings.push(`Repo clonado (--depth 1) desde ${cloned.url}`);
    mkdirSync(join(out, 'raw'), { recursive: true });

    if (stack === 'wxr') {
      scanWxr(root, inv, { out });
    } else if (stack === 'static' || stack === 'wordpress' || stack === 'spa') {
      if (stack === 'spa') {
        inv.warnings.push('SPA detectada: el HTML estático probablemente no contiene el contenido; usa crawl-site --render sobre el sitio publicado');
      }
      if (stack === 'wordpress') {
        inv.warnings.push('Instalación WordPress: solo se inventarían archivos .html; para el contenido exporta un WXR (Herramientas → Exportar)');
      }
      scanStatic(root, inv, { out, origin });
    } else if (stack === 'astro' || stack === 'next' || stack === 'hugo' || stack === 'jekyll') {
      scanFramework(root, inv, { out, origin, build });
    } else {
      inv.warnings.push('Stack desconocido: no se encontraron .html, export WXR ni marcadores de framework');
    }

    inv.stats.fetched = inv.pages.length;
    inv.stats.durationMs = Date.now() - started;
    writeInventory(out, inv);
    return inv;
  } finally {
    if (cloned) rmSync(cloned.dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `scan-source.mjs — inventario desde carpeta, export WXR o repo git

Uso:
  node scan-source.mjs <dir|file.xml|repoUrl> --out <dir> [--build] [--base-url <url>] [--json]

Opciones:
  --out <dir>        Carpeta de salida (inventory.json + raw/). Obligatoria.
  --build            Si hay package.json con script build, ejecuta npm run build y escanea dist|out|_site|build.
  --base-url <url>   Origen para las URLs de carpetas estáticas (por defecto ${DEFAULT_BASE_URL}).
  --json             Imprime el inventario en stdout.
  --help             Esta ayuda.

Stacks: ${STACKS.join(' · ')}.
Nunca se leen ni copian .env*, *.pem, *.key, id_rsa*; quedan registrados en warnings.
Windows + Git Bash: pasa rutas sin barra inicial o usa MSYS_NO_PATHCONV=1.
`;

function parseArgs(argv) {
  const opts = { out: null, build: false, baseUrl: DEFAULT_BASE_URL, json: false, help: false, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--build') opts.build = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a === '--base-url') opts.baseUrl = argv[++i];
    else if (a.startsWith('--base-url=')) opts.baseUrl = a.slice(11);
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
    console.error('Error: se requieren <dir|file.xml|repoUrl> y --out <dir>\n');
    console.error(HELP);
    process.exit(1);
  }
  try {
    const inv = await scan(opts.input, { out: opts.out, build: opts.build, baseUrl: opts.baseUrl });
    if (opts.json) {
      console.log(JSON.stringify(inv, null, 2));
    } else {
      console.log(
        `Inventario: ${inv.pages.length} páginas · ${inv.skipped.length} omitidas · stack ${inv.source.stack} · ${inv.stats.durationMs} ms → ${join(opts.out, 'inventory.json')}`,
      );
      for (const w of inv.warnings) console.log(`  aviso: ${w}`);
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
