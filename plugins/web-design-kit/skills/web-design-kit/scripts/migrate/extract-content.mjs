#!/usr/bin/env node
/**
 * extract-content.mjs — convierte un inventario (crawl-site / scan-source) en contenido Markdown + brief.json.
 *
 * Uso:
 *   node extract-content.mjs <inventory.json> --out <dir> [--download-images] [--source-root <dir>] [--json] [--help]
 *
 * Escribe:
 *   <out>/content/blog/<slug>.md    posts: <slug> = último segmento de la URL (/blog/post-01/ → post-01.md), de modo
 *                                   que copiado a src/content/blog/ Astro lo sirve en la MISMA URL /blog/post-01/.
 *   <out>/content/pages/<slug>.md   páginas: <slug> = slugFromPath (/tag/aceite/ → tag-aceite.md).
 *                             frontmatter: sourceUrl, path (ruta original), title (sin el sufijo " - <sitio>"),
 *                             description, type (page|post), date, author, tags, images[], confidence (high si
 *                             había <main>/<article>; medium si se eligió por densidad). El H1 del cuerpo se omite
 *                             cuando coincide con el título (la plantilla lo pinta desde el frontmatter); los enlaces
 *                             internos quedan relativos a la raíz (/servicios/) y la meta de WP (fecha/autor/etiquetas)
 *                             no se repite en el cuerpo.
 *   <out>/assets/             (con --download-images) imágenes ≤ 10 MB con nombre slug; los enlaces del Markdown
 *                             se reescriben a ../assets/<archivo>. Con source.kind 'dir'|'repo' se copian del disco
 *                             (root = inventory.source.root o --source-root); si no hay root, se avisa y no se copia.
 *   <out>/brief.json          brief v1 (assets/brief.schema.json). Cada campo inferido lleva `sources[<campo>]`
 *                             con {from, confidence}; lo no encontrado es null. `pages[]` lleva path, targetPath
 *                             (por defecto = path; posts fuera de /blog/ → /blog/<slug>/) y file (relativo a content/).
 *
 * Heurísticas (orden de prioridad, spec §3):
 *   NAP        JSON-LD LocalBusiness/Organization (high) > <address> (medium) > regex tel/email en footer (low)
 *   horario    openingHoursSpecification (high) > texto "Lun–Vie … 9:00" (low)
 *   servicios  enlaces de nav bajo /servicios (medium) > h2/h3 de la página cuya URL contiene "servic" (medium)
 *              > títulos h3 repetidos en tarjetas .card (low)
 *   marca      logo: <img> del header con "logo" en src/alt (high) > og:image (low);
 *              colores: <meta theme-color> (high) + top-3 del CSS sin neutros (medium) → OKLCH;
 *              fuentes: font-family de h1/h2 (display) y body/p (body) → @fontsource(-variable) o null (low)
 *   type       local si hay LocalBusiness/dirección; blog si posts > páginas; si no, corporativo
 *   idioma     <html lang> más frecuente; locale <lang>_<país de la dirección | US>
 *   nombre     JSON-LD name (high) > og:site_name (medium) > título de la home antes de " | ", " – ", " - " (low)
 *
 * Cero dependencias. Node ≥ 22. Exit 1 en error fatal, 0 en informativo.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { slugFromPath } from './lib/url.mjs';
import { pathOf } from './lib/redirects.mjs';
import { buildTree, decodeEntities, extractImages, mainContent, nodeText, parseHead } from './lib/html.mjs';
import { htmlToMarkdown } from './lib/html-to-md.mjs';
import { emptyBrief, validateBrief, SOCIAL_KEYS } from './lib/brief.mjs';
import { extractCssColors, extractCssFonts, fontsourcePackage, hexToOklch, parseColor } from './lib/brand.mjs';

export const USER_AGENT = 'web-design-kit-migrate/1.0';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

const POST_URL_RE = /\/(?:blog|posts?)\/[^/]+\/?|\/\d{4}\/\d{2}\//i;
/** Separadores habituales entre el título de la página y el nombre del sitio en <title>. */
const TITLE_SEPARATOR_RE = /\s+[-–—|·•:»]\s+/;
const BUSINESS_TYPES_RE = /business|organization|store|restaurant|dentist|clinic|hotel|shop|service|agency|company|corporation|school|church|physician|lawyer|attorney|realestate|automotive|repair/i;
const NON_BUSINESS_TYPES = new Set(['WebPage', 'WebSite', 'Article', 'BlogPosting', 'NewsArticle', 'BreadcrumbList', 'ImageObject', 'Person', 'FAQPage', 'ItemList', 'SearchAction', 'Product', 'Offer']);
const DAY_CODES = { monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su' };
const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const HOURS_TEXT_RE = /(?:Lun|Mon)[^\n.]{0,40}?\d{1,2}:\d{2}(?:[^\n.]{0,24}?\d{1,2}:\d{2})?/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SOCIAL_HOSTS = [
  ['instagram', /^(www\.)?instagram\.com$/i],
  ['facebook', /^(www\.|m\.)?facebook\.com$/i],
  ['linkedin', /^(www\.)?linkedin\.com$/i],
  ['x', /^(www\.)?(x|twitter)\.com$/i],
  ['youtube', /^(www\.)?(youtube\.com|youtu\.be)$/i],
  ['tiktok', /^(www\.)?tiktok\.com$/i],
];
const COUNTRY_NAMES = {
  'estados unidos': 'US', 'united states': 'US', usa: 'US', 'u.s.a.': 'US', eeuu: 'US', 'ee. uu.': 'US',
  españa: 'ES', espana: 'ES', spain: 'ES', méxico: 'MX', mexico: 'MX', colombia: 'CO', argentina: 'AR',
  chile: 'CL', perú: 'PE', peru: 'PE', venezuela: 'VE', ecuador: 'EC', 'puerto rico': 'PR',
  'república dominicana': 'DO', 'dominican republic': 'DO', guatemala: 'GT', panamá: 'PA', panama: 'PA',
};

// ---------------------------------------------------------------------------
// Utilidades de árbol
// ---------------------------------------------------------------------------

function findAll(node, pred) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (n.type === 'element' && pred(n)) out.push(n);
    if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
}

const findFirst = (node, pred) => findAll(node, pred)[0] ?? null;

function classOf(node) {
  return `${node.attrs?.class ?? ''} ${node.attrs?.id ?? ''}`.toLowerCase();
}

function nextSibling(node, pred) {
  const kids = node.parent?.children ?? [];
  let i = kids.indexOf(node) + 1;
  for (; i < kids.length; i++) {
    const k = kids[i];
    if (k.type === 'text' && k.text.trim() === '') continue;
    return k.type === 'element' && pred(k) ? k : null;
  }
  return null;
}

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const v = c ? decodeEntities(c[1] ?? c[2] ?? '') : '';
  return v.trim() || null;
}

function absUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function flattenJsonld(list) {
  const out = [];
  const push = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(push);
    out.push(o);
    if (Array.isArray(o['@graph'])) o['@graph'].forEach(push);
  };
  (list ?? []).forEach(push);
  return out;
}

function typesOf(obj) {
  const t = obj?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string');
}

function isBusinessJsonld(obj) {
  const types = typesOf(obj);
  if (types.some((t) => NON_BUSINESS_TYPES.has(t))) return false;
  return types.some((t) => BUSINESS_TYPES_RE.test(t)) || Boolean(obj.address || obj.telephone);
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Páginas → Markdown
// ---------------------------------------------------------------------------

function yamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}

function toFrontmatter(data) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        continue;
      }
      lines.push(`${k}:`);
      for (const item of v) {
        if (item && typeof item === 'object') {
          const entries = Object.entries(item);
          entries.forEach(([ik, iv], i) => lines.push(`${i === 0 ? '  - ' : '    '}${ik}: ${yamlValue(iv)}`));
        } else {
          lines.push(`  - ${yamlValue(item)}`);
        }
      }
      continue;
    }
    lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

function insideListOrLink(node, stopAt) {
  for (let p = node.parent; p && p !== stopAt; p = p.parent) {
    if (p.type === 'element' && (p.name === 'li' || p.name === 'a' || p.name === 'table')) return true;
  }
  return false;
}

/**
 * Fecha de publicación: meta article:published_time > <time> dentro del <article> que no forme parte de un
 * listado (li/a/table), para no confundir un índice de posts con un post.
 */
function articleDate(tree, html) {
  const meta = metaContent(html, 'property', 'article:published_time') ?? metaContent(html, 'name', 'date');
  if (meta) return meta;
  const article = findFirst(tree, (n) => n.name === 'article') ?? tree;
  const time = findAll(article, (n) => n.name === 'time' && (n.attrs.datetime || nodeText(n))).find((t) => !insideListOrLink(t, article));
  if (!time) return null;
  return str(time.attrs.datetime) ?? str(nodeText(time));
}

function articleAuthor(tree, html) {
  const meta = metaContent(html, 'name', 'author');
  if (meta) return meta;
  const a = findFirst(tree, (n) => n.name === 'a' && /(^|\s)author(\s|$)/i.test(n.attrs.rel ?? ''));
  if (a) return str(nodeText(a));
  const by = findFirst(tree, (n) => /(^|\s)(author|byline|vcard)(\s|$)/.test(classOf(n)));
  return by ? str(nodeText(by).replace(/^(por|by)\s+/i, '')) : null;
}

function articleTags(tree) {
  const tags = findAll(tree, (n) => n.name === 'a' && /(^|\s)tag(\s|$)/i.test(n.attrs.rel ?? '')).map((a) => nodeText(a));
  return [...new Set(tags.filter(Boolean))];
}

function classifyPage(page, tree, html) {
  if (page.type === 'post') return 'post';
  if (page.type === 'page') return 'page';
  const path = (() => {
    try {
      return new URL(page.url).pathname;
    } catch {
      return page.url;
    }
  })();
  if (POST_URL_RE.test(path)) return 'post';
  const article = findFirst(tree, (n) => n.name === 'article');
  if (article && articleDate(article, html)) return 'post';
  return 'page';
}

/** Último segmento de una ruta como slug: `/blog/post-01/` → `post-01`; `/` → `index`. */
function lastSegmentSlug(path) {
  const segments = String(path).split('/').filter(Boolean);
  return segments.length ? slugFromPath(`/${segments[segments.length - 1]}`) : 'index';
}

/**
 * Página del inventario → {slug, file, path, targetPath, data (frontmatter), body, type, tree}.
 * - post → `blog/<último segmento>.md`, targetPath `/blog/<slug>/` (igual a path si ya estaba bajo /blog/).
 * - page → `pages/<slugFromPath>.md`, targetPath = path.
 * `rootRelativeOrigin`: los enlaces del cuerpo a ese origen se escriben como ruta relativa a la raíz.
 */
function pageToDoc(page, html, { rootRelativeOrigin = '' } = {}) {
  const tree = buildTree(html);
  const base = page.finalUrl ?? page.url;
  const main = mainContent(html);
  const body = htmlToMarkdown(main.html, { baseUrl: base, rootRelativeOrigin });
  const type = classifyPage(page, tree, html);
  const images = extractImages(main.html, base).map((i) => ({ src: i.src, alt: i.alt, width: i.width, height: i.height }));
  const path = pathOf(page.url) ?? '/';
  const slug = type === 'post' ? lastSegmentSlug(path) : slugFromPath(page.url);
  const targetPath = type === 'post' ? `/blog/${slug}/` : path;
  const data = {
    sourceUrl: page.url,
    path,
    title: page.title ?? page.h1 ?? null,
    description: page.description ?? null,
    type,
    date: type === 'post' ? page.date ?? articleDate(tree, html) : null,
    author: type === 'post' ? page.author ?? articleAuthor(tree, html) : null,
    tags: type === 'post' ? (Array.isArray(page.tags) && page.tags.length ? page.tags : articleTags(tree)) : [],
    images,
    confidence: main.confidence,
  };
  return { slug, path, targetPath, data, body, type, tree, h1: page.h1 ?? null };
}

/** Texto comparable: sin escapes Markdown, minúsculas, espacios colapsados. */
function comparable(s) {
  return String(s ?? '')
    .replace(/\\([\\`*_[\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Quita el sufijo " - <nombre del sitio>" (o | · – — : ») del título de la página. Si tras quitarlo no queda
 * nada, se conserva el original (p. ej. la home se titula solo con el nombre del sitio).
 */
export function stripSiteNameSuffix(title, siteName) {
  if (!title || !siteName) return title ?? null;
  const t = String(title).trim();
  const name = comparable(siteName);
  const m = new RegExp(`${TITLE_SEPARATOR_RE.source}([^]*)$`).exec(t);
  if (!m) return t;
  const idx = t.length - m[0].length;
  const tail = comparable(m[1]);
  if (tail !== name) return t;
  const head = t.slice(0, idx).trim();
  return head || t;
}

/**
 * Si el primer bloque del cuerpo es un H1 igual (sin mayúsculas/espacios) al título o al h1 de la página,
 * se elimina: el título vive en el frontmatter y la plantilla ya lo pinta.
 */
export function stripLeadingH1(body, titles) {
  const m = /^# (.+?)\n+/.exec(body);
  if (!m) return body;
  const h1 = comparable(m[1]);
  const matches = titles.filter(Boolean).some((t) => comparable(t) === h1);
  return matches ? body.slice(m[0].length) : body;
}

/** Aplica las limpiezas que dependen del nombre del sitio: título sin sufijo y H1 duplicado fuera del cuerpo. */
function finalizeDoc(doc, siteName) {
  const rawTitle = doc.data.title;
  doc.data.title = stripSiteNameSuffix(rawTitle, siteName);
  doc.body = stripLeadingH1(doc.body, [doc.data.title, rawTitle, doc.h1]);
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------

function assetName(url, used) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const ext = (extname(path) || '').toLowerCase().slice(0, 6);
  let base = slugFromPath(path) || 'image';
  if (base === 'index') base = 'image';
  let name = `${base}${ext}`;
  let i = 2;
  while (used.has(name) && used.get(name) !== url) name = `${base}-${i++}${ext}`;
  used.set(name, url);
  return name;
}

async function fetchImage(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_IMAGE_BYTES) throw new Error(`supera 10 MB (${len} bytes)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error(`supera 10 MB (${buf.byteLength} bytes)`);
  return buf;
}

async function collectImages(docs, { out, inventory, sourceRoot, warnings }) {
  const assetsDir = join(out, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const kind = inventory.source?.kind ?? 'url';
  const fromDisk = kind === 'dir' || kind === 'repo';
  if (fromDisk && !sourceRoot) {
    warnings.push('No se copiaron imágenes: el inventario (source.kind dir|repo) no registra la carpeta raíz escaneada; pásala con --source-root <dir>');
  }
  const used = new Map();
  const mapping = new Map(); // url → nombre local
  const all = new Map();
  for (const d of docs) for (const img of d.data.images) if (!all.has(img.src)) all.set(img.src, img);

  let ok = 0;
  for (const [url] of all) {
    const name = assetName(url, used);
    const dest = join(assetsDir, name);
    try {
      if (fromDisk) {
        if (!sourceRoot) continue;
        const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
        const src = resolve(sourceRoot, rel);
        if (!src.startsWith(resolve(sourceRoot))) throw new Error('ruta fuera de la raíz');
        if (!existsSync(src)) {
          warnings.push(`Imagen no existe en disco: ${rel}`);
          continue;
        }
        if (statSync(src).size > MAX_IMAGE_BYTES) {
          warnings.push(`Imagen omitida (> 10 MB): ${rel}`);
          continue;
        }
        if (!existsSync(dest)) copyFileSync(src, dest);
      } else {
        if (!existsSync(dest)) writeFileSync(dest, await fetchImage(url));
      }
      mapping.set(url, name);
      ok++;
    } catch (err) {
      warnings.push(`Imagen no descargada ${url}: ${err.message}`);
    }
  }
  return { mapping, count: ok };
}

function rewriteImageLinks(doc, mapping) {
  if (mapping.size === 0) return;
  for (const img of doc.data.images) {
    const local = mapping.get(img.src);
    img.local = local ? `../assets/${local}` : null;
    if (!local) continue;
    const esc = img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    doc.body = doc.body.replace(new RegExp(`\\]\\(${esc}(\\s+"[^"]*")?\\)`, 'g'), `](../assets/${local}$1)`);
  }
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

function hoursFromSpec(spec) {
  const list = Array.isArray(spec) ? spec : [spec];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek])
      .filter((d) => typeof d === 'string')
      .map((d) => DAY_CODES[d.split('/').pop().toLowerCase()])
      .filter(Boolean)
      .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    const opens = str(s.opens);
    const closes = str(s.closes);
    if (!days.length || !opens || !closes) continue;
    const idx = days.map((d) => DAY_ORDER.indexOf(d));
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    const dayStr = days.length > 1 && contiguous ? `${days[0]}-${days[days.length - 1]}` : days.join(',');
    out.push(`${dayStr} ${opens.slice(0, 5)}-${closes.slice(0, 5)}`);
  }
  return out;
}

function addressFromJsonld(a) {
  if (!a) return null;
  if (typeof a === 'string') return { streetAddress: a, addressLocality: null, addressRegion: null, postalCode: null, addressCountry: null };
  if (Array.isArray(a)) return addressFromJsonld(a[0]);
  const country = a.addressCountry && typeof a.addressCountry === 'object' ? a.addressCountry.name : a.addressCountry;
  const addr = {
    streetAddress: str(a.streetAddress),
    addressLocality: str(a.addressLocality),
    addressRegion: str(a.addressRegion),
    postalCode: str(a.postalCode) ?? (typeof a.postalCode === 'number' ? String(a.postalCode) : null),
    addressCountry: str(country),
  };
  return Object.values(addr).some(Boolean) ? addr : null;
}

function addressFromText(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const us = /^(.*?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/.exec(t);
  if (us) return { streetAddress: us[1], addressLocality: us[2], addressRegion: us[3], postalCode: us[4], addressCountry: null };
  return { streetAddress: t, addressLocality: null, addressRegion: null, postalCode: null, addressCountry: null };
}

function normalizePhone(s) {
  const v = String(s ?? '').trim();
  if (!v) return null;
  return v.replace(/^tel:/i, '').replace(/[^\d+]/g, '') || null;
}

function countryCode(value, fallback = 'US') {
  const v = str(value);
  if (!v) return fallback;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_NAMES[v.toLowerCase()] ?? fallback;
}

/**
 * Construye el brief v1 a partir de las páginas y sus HTML.
 * @param {object} inventory
 * @param {{page: object, html: string, doc: object}[]} entries
 * @param {{cssLoader: (url: string) => Promise<string|null>, warnings: string[]}} ctx
 */
async function buildBrief(inventory, entries, { cssLoader, warnings }) {
  const brief = emptyBrief();
  const origin = inventory.source?.origin ?? 'inventory';
  const src = (key, from, confidence) => {
    brief.sources[key] = { from, confidence };
  };

  const home = entries.find((e) => {
    try {
      return new URL(e.page.url).pathname === '/';
    } catch {
      return false;
    }
  }) ?? entries[0];

  // --- JSON-LD de negocio -------------------------------------------------
  let biz = null;
  for (const e of entries) {
    const found = flattenJsonld(e.page.jsonld?.length ? e.page.jsonld : parseHead(e.html).jsonld).find(isBusinessJsonld);
    if (found) {
      biz = { obj: found, from: e.page.url };
      break;
    }
  }

  // --- Nombre --------------------------------------------------------------
  if (biz && str(biz.obj.name)) {
    brief.name = str(biz.obj.name);
    src('name', biz.from, 'high');
  } else {
    const siteName = entries.map((e) => metaContent(e.html, 'property', 'og:site_name')).find(Boolean);
    if (siteName) {
      brief.name = siteName;
      src('name', home?.page.url ?? origin, 'medium');
    } else if (home?.page.title) {
      const [first] = home.page.title.split(/\s+[|–—-]\s+/);
      brief.name = first.trim() || home.page.title;
      src('name', home.page.url, 'low');
    }
  }

  // --- NAP -------------------------------------------------------------------
  if (biz) {
    const phone = normalizePhone(biz.obj.telephone);
    if (phone) {
      brief.contact.phone = phone;
      src('contact.phone', biz.from, 'high');
    }
    const email = str(biz.obj.email)?.replace(/^mailto:/i, '');
    if (email) {
      brief.contact.email = email;
      src('contact.email', biz.from, 'high');
    }
    const address = addressFromJsonld(biz.obj.address);
    if (address) {
      brief.contact.address = address;
      src('contact.address', biz.from, 'high');
    }
    const hours = hoursFromSpec(biz.obj.openingHoursSpecification);
    if (hours.length) {
      brief.contact.openingHours = hours;
      src('contact.openingHours', biz.from, 'high');
    } else if (biz.obj.openingHours) {
      const oh = Array.isArray(biz.obj.openingHours) ? biz.obj.openingHours : [biz.obj.openingHours];
      brief.contact.openingHours = oh.filter((x) => typeof x === 'string');
      if (brief.contact.openingHours.length) src('contact.openingHours', biz.from, 'high');
    }
  }
  if (!brief.contact.phone || !brief.contact.email || !brief.contact.address) {
    for (const e of entries) {
      const addr = findFirst(e.doc.tree, (n) => n.name === 'address');
      if (!addr) continue;
      const tel = findFirst(addr, (n) => n.name === 'a' && /^tel:/i.test(n.attrs.href ?? ''));
      const mail = findFirst(addr, (n) => n.name === 'a' && /^mailto:/i.test(n.attrs.href ?? ''));
      if (!brief.contact.phone && tel) {
        brief.contact.phone = normalizePhone(tel.attrs.href);
        src('contact.phone', e.page.url, 'medium');
      }
      if (!brief.contact.email && mail) {
        brief.contact.email = mail.attrs.href.replace(/^mailto:/i, '').split('?')[0];
        src('contact.email', e.page.url, 'medium');
      }
      if (!brief.contact.address) {
        const text = nodeText(addr).replace(/(Tel|Tel[eé]fono|Phone|Email|Correo)\s*:.*$/i, '').trim();
        const parsed = addressFromText(text);
        if (parsed) {
          brief.contact.address = parsed;
          src('contact.address', e.page.url, 'medium');
        }
      }
      break;
    }
  }
  if (!brief.contact.phone || !brief.contact.email) {
    for (const e of entries) {
      const footer = findFirst(e.doc.tree, (n) => n.name === 'footer' || (n.attrs.role ?? '') === 'contentinfo' || /footer/.test(classOf(n)));
      if (!footer) continue;
      const text = nodeText(footer);
      if (!brief.contact.phone) {
        const tel = findFirst(footer, (n) => n.name === 'a' && /^tel:/i.test(n.attrs.href ?? ''));
        const m = tel ? tel.attrs.href : PHONE_RE.exec(text)?.[0];
        if (m) {
          brief.contact.phone = normalizePhone(m);
          src('contact.phone', e.page.url, 'low');
        }
      }
      if (!brief.contact.email) {
        const m = EMAIL_RE.exec(text)?.[0];
        if (m) {
          brief.contact.email = m;
          src('contact.email', e.page.url, 'low');
        }
      }
      if (brief.contact.phone && brief.contact.email) break;
    }
  }
  if (brief.contact.openingHours.length === 0) {
    for (const e of entries) {
      const m = HOURS_TEXT_RE.exec(nodeText(e.doc.tree));
      if (m) {
        brief.contact.openingHours = [m[0].trim()];
        src('contact.openingHours', e.page.url, 'low');
        break;
      }
    }
  }

  // --- Redes ---------------------------------------------------------------
  for (const e of entries) {
    const hrefs = [...e.html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => decodeEntities(m[1]));
    for (const href of hrefs) {
      let host;
      try {
        host = new URL(href).hostname;
      } catch {
        continue;
      }
      for (const [key, re] of SOCIAL_HOSTS) {
        if (brief.social[key] || !re.test(host)) continue;
        if (/\/(sharer|share|intent|dialog)\b/.test(href)) continue;
        brief.social[key] = href;
        src(`social.${key}`, e.page.url, 'medium');
      }
    }
  }

  // --- Idioma y locale -----------------------------------------------------
  const langCounts = new Map();
  for (const e of entries) {
    const l = str(e.page.lang ?? parseHead(e.html).lang);
    if (l) langCounts.set(l, (langCounts.get(l) ?? 0) + 1);
  }
  const topLang = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const lang = (topLang ?? 'es').split(/[-_]/)[0].toLowerCase();
  brief.language = lang;
  src('language', topLang ? home?.page.url ?? origin : origin, topLang ? 'high' : 'low');
  const country = countryCode(brief.contact.address?.addressCountry, 'US');
  brief.locale = `${lang}_${country}`;
  src('locale', brief.contact.address?.addressCountry ? brief.sources['contact.address'].from : origin, brief.contact.address?.addressCountry ? 'high' : 'low');

  // --- Páginas y migración -------------------------------------------------
  brief.pages = entries.map((e) => ({
    sourceUrl: e.page.url,
    title: e.doc.data.title,
    slug: e.doc.slug,
    type: e.doc.type,
    path: e.doc.path,
    targetPath: e.doc.targetPath,
    file: e.doc.file,
  }));
  const posts = entries.filter((e) => e.doc.type === 'post').length;
  brief.migration = { inventoryCount: inventory.pages?.length ?? entries.length, posts, redirectsPlanned: null };

  // --- Tipo ------------------------------------------------------------------
  if (biz && (typesOf(biz.obj).some((t) => /business/i.test(t)) || brief.contact.address)) {
    brief.type = 'local';
    src('type', biz.from, 'high');
  } else if (brief.contact.address) {
    brief.type = 'local';
    src('type', brief.sources['contact.address'].from, 'medium');
  } else if (posts > entries.length - posts) {
    brief.type = 'blog';
    src('type', origin, 'medium');
  } else {
    brief.type = 'corporativo';
    src('type', origin, 'low');
  }

  // --- Dominio ---------------------------------------------------------------
  try {
    const host = new URL(origin).hostname;
    if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(host)) {
      brief.domain = host;
      src('domain', origin, inventory.source?.kind === 'url' ? 'high' : 'medium');
    }
  } catch {
    /* origin no es URL */
  }

  // --- Servicios ---------------------------------------------------------
  const services = [];
  const navLinks = new Map();
  for (const e of entries) {
    for (const nav of findAll(e.doc.tree, (n) => n.name === 'nav' || (n.attrs.role ?? '') === 'navigation')) {
      for (const a of findAll(nav, (n) => n.name === 'a' && n.attrs.href)) {
        const abs = absUrl(a.attrs.href, e.page.finalUrl ?? e.page.url);
        if (!abs) continue;
        const path = new URL(abs).pathname;
        if (/^\/(servicios|services|servizi|servicos)\/[^/]+\/?$/i.test(path) && !navLinks.has(abs)) {
          navLinks.set(abs, { title: nodeText(a), summary: null, sourceUrl: abs });
        }
      }
    }
  }
  if (navLinks.size) {
    services.push(...navLinks.values());
    src('services', home?.page.url ?? origin, 'medium');
  } else {
    const servPage = entries.find((e) => /servic/i.test(e.page.url));
    if (servPage) {
      const main = buildTree(mainContent(servPage.html).html);
      let heads = findAll(main, (n) => n.name === 'h2');
      if (heads.length < 2) heads = findAll(main, (n) => n.name === 'h3');
      for (const h of heads) {
        const title = nodeText(h);
        if (!title) continue;
        const p = nextSibling(h, (n) => n.name === 'p');
        services.push({ title, summary: p ? nodeText(p) : null, sourceUrl: servPage.page.url });
      }
      if (services.length) src('services', servPage.page.url, 'medium');
    }
    if (!services.length) {
      const cardCounts = new Map();
      for (const e of entries) {
        for (const card of findAll(e.doc.tree, (n) => /(^|\s)card(s)?(\s|$|-)/.test(classOf(n)))) {
          const h = findFirst(card, (n) => /^h[2-4]$/.test(n.name));
          const title = h ? nodeText(h) : null;
          if (!title) continue;
          const p = findFirst(card, (n) => n.name === 'p');
          const cur = cardCounts.get(title) ?? { title, summary: p ? nodeText(p) : null, sourceUrl: e.page.url, count: 0 };
          cur.count++;
          cardCounts.set(title, cur);
        }
      }
      const cards = [...cardCounts.values()];
      if (cards.length >= 2) {
        services.push(...cards.map(({ count, ...s }) => s));
        src('services', cards[0].sourceUrl, 'low');
      }
    }
  }
  brief.services = services;

  // --- Marca -----------------------------------------------------------------
  for (const e of entries) {
    const headers = findAll(e.doc.tree, (n) => n.name === 'header' || (n.attrs.role ?? '') === 'banner' || /(^|\s)(site-)?header(\s|$)/.test(classOf(n)));
    const img = headers.map((h) => findFirst(h, (n) => n.name === 'img' && /logo/i.test(`${n.attrs.src ?? ''} ${n.attrs.alt ?? ''} ${n.attrs.class ?? ''}`))).find(Boolean);
    if (img) {
      brief.brand.logo = absUrl(img.attrs.src ?? img.attrs['data-src'], e.page.finalUrl ?? e.page.url);
      src('brand.logo', e.page.url, 'high');
      break;
    }
  }
  if (!brief.brand.logo) {
    const og = entries.map((e) => e.page.ogImage ?? parseHead(e.html).ogImage).find(Boolean);
    if (og) {
      brief.brand.logo = og;
      src('brand.logo', home?.page.url ?? origin, 'low');
    }
  }

  const colors = [];
  const seen = new Set();
  const themeEntry = entries.find((e) => parseColor(parseHead(e.html).themeColor));
  if (themeEntry) {
    const hex = parseColor(parseHead(themeEntry.html).themeColor);
    colors.push({ hex, oklch: hexToOklch(hex).css, role: 'primary' });
    seen.add(hex);
    src('brand.colors[0]', themeEntry.page.url, 'high');
  }

  // CSS: hojas enlazadas (dedupe) + <style> inline
  const cssUrls = new Map();
  let inlineCss = '';
  for (const e of entries) {
    const base = e.page.finalUrl ?? e.page.url;
    for (const m of e.html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag)) continue;
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      const abs = href && absUrl(decodeEntities(href[1] ?? href[2]), base);
      if (abs && !cssUrls.has(abs)) cssUrls.set(abs, e.page.url);
    }
    for (const m of e.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) inlineCss += `\n${m[1]}`;
  }
  let cssText = inlineCss;
  let cssFrom = inlineCss.trim() ? home?.page.url ?? origin : null;
  for (const [url] of cssUrls) {
    const text = await cssLoader(url);
    if (text) {
      cssText += `\n${text}`;
      cssFrom ??= url;
    }
  }
  if (cssUrls.size && !cssFrom) warnings.push(`No se pudo leer ninguna hoja CSS (${cssUrls.size} enlazadas); colores y fuentes solo desde <meta theme-color>`);

  if (cssText.trim()) {
    for (const c of extractCssColors(cssText, { limit: 3 })) {
      if (seen.has(c.hex)) continue;
      seen.add(c.hex);
      const idx = colors.length;
      colors.push({ hex: c.hex, oklch: hexToOklch(c.hex).css, role: idx === 0 ? 'primary' : idx === 1 ? 'accent' : null });
      src(`brand.colors[${idx}]`, cssFrom, 'medium');
    }
    const fonts = extractCssFonts(cssText);
    for (const role of ['display', 'body']) {
      const family = fonts[role];
      if (!family) continue;
      const pkg = fontsourcePackage(family);
      brief.brand.fonts.push({ family, role, fontsource: pkg });
      src(`brand.fonts[${brief.brand.fonts.length - 1}]`, cssFrom, pkg ? 'high' : 'low');
    }
  }
  brief.brand.colors = colors;

  return brief;
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * @param {object} inventory inventario (crawl-site / scan-source)
 * @param {{out: string, inventoryDir?: string, downloadImages?: boolean, sourceRoot?: string|null}} opts
 *   inventoryDir: carpeta que contiene raw/ (por defecto `out`). sourceRoot: raíz escaneada (dir|repo) para
 *   leer CSS e imágenes del disco; si falta se usa inventory.source.root.
 * @returns {Promise<{brief: object, files: string[], assets: number, warnings: string[]}>}
 */
export async function extract(inventory, { out, inventoryDir = null, downloadImages = false, sourceRoot = null } = {}) {
  if (!out) throw new Error('Falta --out <dir>');
  if (!inventory || !Array.isArray(inventory.pages)) throw new Error('Inventario inválido: falta `pages`');
  const rawDir = join(inventoryDir ?? out, 'raw');
  const root = sourceRoot ?? inventory.source?.root ?? null;
  const warnings = [];
  const contentDir = join(out, 'content');
  mkdirSync(join(contentDir, 'blog'), { recursive: true });
  mkdirSync(join(contentDir, 'pages'), { recursive: true });
  const origin = (() => {
    try {
      return new URL(inventory.source?.origin ?? inventory.pages.find((p) => p.url)?.url).origin;
    } catch {
      return '';
    }
  })();

  // Páginas con HTML disponible
  const entries = [];
  const files = new Map(); // archivo relativo a content/ → url
  for (const page of inventory.pages) {
    if (typeof page.status === 'number' && page.status >= 400) {
      warnings.push(`Omitida ${page.url}: HTTP ${page.status}`);
      continue;
    }
    if (!page.rawFile) {
      warnings.push(`Omitida ${page.url}: sin HTML en raw/`);
      continue;
    }
    const file = join(rawDir, basename(page.rawFile));
    if (!existsSync(file)) {
      warnings.push(`Omitida ${page.url}: no existe ${file}`);
      continue;
    }
    const html = readFileSync(file, 'utf8');
    const doc = pageToDoc(page, html, { rootRelativeOrigin: origin });
    const dir = doc.type === 'post' ? 'blog' : 'pages';
    let slug = doc.slug;
    if (files.has(`${dir}/${slug}.md`)) {
      let i = 2;
      while (files.has(`${dir}/${slug}-${i}.md`)) i++;
      slug = `${slug}-${i}`;
      doc.slug = slug;
      if (doc.type === 'post') doc.targetPath = `/blog/${slug}/`;
    }
    doc.file = `${dir}/${slug}.md`;
    files.set(doc.file, page.url);
    entries.push({ page, html, doc });
  }
  if (entries.length === 0) throw new Error('Ninguna página del inventario tiene HTML en raw/');

  // Imágenes
  let assets = 0;
  if (downloadImages) {
    const { mapping, count } = await collectImages(entries.map((e) => e.doc), { out, inventory, sourceRoot: root, warnings });
    assets = count;
    for (const e of entries) rewriteImageLinks(e.doc, mapping);
  }

  // Brief (necesita el nombre del sitio antes de limpiar títulos y H1)
  const kind = inventory.source?.kind ?? 'url';
  const cssLoader = async (url) => {
    if (kind === 'url') {
      try {
        const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        warnings.push(`CSS no descargado ${url}: ${err.message}`);
        return null;
      }
    }
    if (!root) return null;
    try {
      const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
      const file = resolve(root, rel);
      if (!file.startsWith(resolve(root)) || !existsSync(file)) return null;
      return readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  };
  if (kind !== 'url' && !root) warnings.push('CSS no leído: el inventario no registra la carpeta raíz escaneada; pásala con --source-root <dir>');

  const brief = await buildBrief(inventory, entries, { cssLoader, warnings });

  // Limpieza dependiente del nombre del sitio (H-02/H-06) y Markdown
  const written = [];
  for (const e of entries) {
    finalizeDoc(e.doc, brief.name);
    const file = join(contentDir, e.doc.file);
    writeFileSync(file, `${toFrontmatter(e.doc.data)}\n${e.doc.body}`, 'utf8');
    written.push(file);
  }
  for (const p of brief.pages) {
    const e = entries.find((x) => x.page.url === p.sourceUrl);
    if (e) p.title = e.doc.data.title;
  }

  const check = validateBrief(brief);
  if (!check.ok) throw new Error(`brief.json no valida contra el schema v1:\n  ${check.errors.join('\n  ')}`);
  writeFileSync(join(out, 'brief.json'), `${JSON.stringify(brief, null, 2)}\n`, 'utf8');

  return { brief, files: written, assets, warnings };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `extract-content.mjs — inventario → content/blog/<slug>.md + content/pages/<slug>.md + assets/ + brief.json

Uso:
  node extract-content.mjs <inventory.json> --out <dir> [--download-images] [--source-root <dir>] [--json]

Opciones:
  --out <dir>          Carpeta de salida (content/, assets/, brief.json). Obligatoria.
  --download-images    Descarga (URL) o copia (dir|repo) las imágenes ≤ 10 MB a assets/ y reescribe los enlaces.
  --source-root <dir>  Carpeta raíz escaneada por scan-source (para leer CSS e imágenes del disco).
  --json               Imprime el brief en stdout.
  --help               Esta ayuda.

raw/ se busca junto al inventory.json indicado. Todo campo inferido del brief lleva sources[campo] = {from, confidence}.
Posts → content/blog/<último segmento de la URL>.md (copiar a src/content/blog/ SIN renombrar conserva la URL);
páginas → content/pages/<slug>.md. brief.pages[] lleva path, targetPath y file.
Windows + Git Bash: pasa rutas sin barra inicial o usa MSYS_NO_PATHCONV=1.
`;

function parseArgs(argv) {
  const opts = { input: null, out: null, downloadImages: false, sourceRoot: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--download-images') opts.downloadImages = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a === '--source-root') opts.sourceRoot = argv[++i];
    else if (a.startsWith('--source-root=')) opts.sourceRoot = a.slice(14);
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
    if (!existsSync(file)) throw new Error(`No existe ${opts.input}`);
    const inventory = JSON.parse(readFileSync(file, 'utf8'));
    const r = await extract(inventory, {
      out: opts.out,
      inventoryDir: dirname(file),
      downloadImages: opts.downloadImages,
      sourceRoot: opts.sourceRoot,
    });
    if (opts.json) {
      console.log(JSON.stringify(r.brief, null, 2));
    } else {
      console.log(
        `Extracción: ${r.files.length} páginas → ${join(opts.out, 'content')} · ${r.assets} imágenes · brief ${r.brief.type} "${r.brief.name}" → ${join(opts.out, 'brief.json')}`,
      );
    }
    const MAX_WARNINGS = 20;
    for (const w of r.warnings.slice(0, MAX_WARNINGS)) console.error(`  aviso: ${w}`);
    if (r.warnings.length > MAX_WARNINGS) console.error(`  … y ${r.warnings.length - MAX_WARNINGS} avisos más`);
    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
