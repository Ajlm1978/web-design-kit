/**
 * html.mjs — parsing HTML sin dependencias (tokenizador + árbol simplificado) para la migración.
 *
 * Node >= 22, ESM, cero dependencias. Tolera orden de atributos, comillas simples/dobles/sin comillas,
 * etiquetas en mayúsculas, auto-cierre y entidades (nombradas comunes + numéricas).
 *
 * Interfaz pública (plan Task 1):
 * - parseHead(html) → {title, description, canonical, robots, lang, ogImage, themeColor, jsonld}
 * - extractLinks(html, base) → string[]          (normalizados, mismo origen, sin duplicados)
 * - extractImages(html, base) → {src, alt, width, height}[]
 * - mainContent(html) → {html, confidence}       (main/article → high; densidad de texto → medium)
 * - textOf(html) → string
 * - wordCount(text) → number
 * - contentHash(text) → string                    (sha1 del texto normalizado)
 *
 * Además exporta utilidades internas reutilizadas por html-to-md.mjs:
 * decodeEntities, tokenize, buildTree, nodeText, serialize.
 */

import { createHash } from 'node:crypto';
import { normalizeUrl } from './url.mjs';

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  times: '×', divide: '÷', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', ccedil: 'ç', Ccedil: 'Ç',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', szlig: 'ß', ordf: 'ª', ordm: 'º',
};

/**
 * Decodifica entidades HTML nombradas (comunes) y numéricas (decimal y hex).
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  if (!s || s.indexOf('&') === -1) return s ?? '';
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) return NAMED_ENTITIES[body];
    const lower = body.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) return NAMED_ENTITIES[lower];
    return match;
  });
}

// ---------------------------------------------------------------------------
// Tokenizador
// ---------------------------------------------------------------------------

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(src) {
  const attrs = {};
  if (!src) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(src)) !== null) {
    const key = m[1].toLowerCase();
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    if (!(key in attrs)) attrs[key] = decodeEntities(raw);
  }
  return attrs;
}

/**
 * Tokeniza HTML en una lista plana de {type:'open'|'close'|'text'|'raw', name, attrs, selfClosing, text}.
 * Comentarios y doctype se descartan. El contenido de script/style/textarea/title se emite como `raw`.
 * @param {string} html
 */
export function tokenize(html) {
  const tokens = [];
  const src = String(html ?? '');
  let pos = 0;
  TAG_RE.lastIndex = 0;

  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    if (lt === -1) {
      tokens.push({ type: 'text', text: src.slice(pos) });
      break;
    }
    if (lt > pos) tokens.push({ type: 'text', text: src.slice(pos, lt) });

    // Comentario
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      pos = end === -1 ? src.length : end + 3;
      continue;
    }
    // Doctype / declaraciones
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const end = src.indexOf('>', lt + 2);
      pos = end === -1 ? src.length : end + 1;
      continue;
    }

    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m || m.index !== lt) {
      // `<` suelto: tratar como texto
      tokens.push({ type: 'text', text: '<' });
      pos = lt + 1;
      continue;
    }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    pos = m.index + m[0].length;

    if (closing) {
      tokens.push({ type: 'close', name });
      continue;
    }
    const attrs = parseAttrs(m[3]);
    const selfClosing = m[4] === '/' || VOID_ELEMENTS.has(name);
    tokens.push({ type: 'open', name, attrs, selfClosing });

    if (!selfClosing && RAW_TEXT_ELEMENTS.has(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'ig');
      closeRe.lastIndex = pos;
      const cm = closeRe.exec(src);
      const end = cm ? cm.index : src.length;
      tokens.push({ type: 'raw', text: src.slice(pos, end) });
      tokens.push({ type: 'close', name });
      pos = cm ? cm.index + cm[0].length : src.length;
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Árbol simplificado
// ---------------------------------------------------------------------------

const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
]);
/**
 * Elementos que cierran implícitamente al abrirse otro del mismo grupo:
 * `close` = qué ancestro abierto se cierra; `stopAt` = contenedores que no se cruzan.
 */
const TABLE_SECTIONS = ['table', 'thead', 'tbody', 'tfoot'];
const AUTO_CLOSE = {
  li: { close: new Set(['li']), stopAt: new Set(['ul', 'ol', 'menu']) },
  dt: { close: new Set(['dt', 'dd']), stopAt: new Set(['dl']) },
  dd: { close: new Set(['dt', 'dd']), stopAt: new Set(['dl']) },
  tr: { close: new Set(['tr']), stopAt: new Set(TABLE_SECTIONS) },
  td: { close: new Set(['td', 'th']), stopAt: new Set(['tr', ...TABLE_SECTIONS]) },
  th: { close: new Set(['td', 'th']), stopAt: new Set(['tr', ...TABLE_SECTIONS]) },
  option: { close: new Set(['option']), stopAt: new Set(['select', 'datalist']) },
};

/**
 * Construye un árbol {type:'root'|'element'|'text', name, attrs, children, text} con cierre implícito
 * de <p>, <li>, <td>… al estilo del parser HTML.
 * @param {string} html
 */
export function buildTree(html) {
  const root = { type: 'root', name: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const closeUntil = (name) => {
    for (let i = stack.length - 1; i > 0; i--) {
      if (stack[i].name === name) {
        stack.length = i;
        return true;
      }
    }
    return false;
  };

  for (const tok of tokenize(html)) {
    if (tok.type === 'text' || tok.type === 'raw') {
      top().children.push({ type: 'text', text: tok.text, raw: tok.type === 'raw', parent: top() });
      continue;
    }
    if (tok.type === 'close') {
      closeUntil(tok.name);
      continue;
    }
    // open
    if (BLOCK_ELEMENTS.has(tok.name) && tok.name !== 'p') {
      // Un bloque dentro de <p> abierto lo cierra implícitamente.
      if (stack.length > 1 && top().name === 'p') stack.pop();
    } else if (tok.name === 'p' && top().name === 'p') {
      stack.pop();
    }
    const autoClose = AUTO_CLOSE[tok.name];
    if (autoClose) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (autoClose.close.has(stack[i].name)) {
          stack.length = i;
          break;
        }
        if (autoClose.stopAt.has(stack[i].name)) break;
      }
    }
    const node = { type: 'element', name: tok.name, attrs: tok.attrs, children: [], parent: top() };
    top().children.push(node);
    if (!tok.selfClosing) stack.push(node);
  }
  return root;
}

/** Texto plano de un nodo (sin script/style), entidades decodificadas, espacios colapsados. */
export function nodeText(node, { skip = new Set(['script', 'style', 'noscript', 'template']) } = {}) {
  const parts = [];
  const walk = (n) => {
    if (n.type === 'text') {
      if (!n.raw) parts.push(decodeEntities(n.text));
      return;
    }
    if (n.type === 'element') {
      if (skip.has(n.name)) return;
      if (n.name === 'br') parts.push(' ');
    }
    for (const c of n.children) walk(c);
    if (n.type === 'element' && BLOCK_ELEMENTS.has(n.name)) parts.push(' ');
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Serializa un nodo de vuelta a HTML (atributos re-escapados). */
export function serialize(node) {
  if (node.type === 'text') return node.text;
  const inner = node.children.map(serialize).join('');
  if (node.type === 'root') return inner;
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`))
    .join('');
  if (VOID_ELEMENTS.has(node.name)) return `<${node.name}${attrs}>`;
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/** Recorre el árbol y devuelve el primer elemento que cumpla `pred`. */
function findFirst(node, pred) {
  if (node.type === 'element' && pred(node)) return node;
  for (const c of node.children ?? []) {
    const r = findFirst(c, pred);
    if (r) return r;
  }
  return null;
}

function findAll(node, pred, out = []) {
  if (node.type === 'element' && pred(node)) out.push(node);
  for (const c of node.children ?? []) findAll(c, pred, out);
  return out;
}

// ---------------------------------------------------------------------------
// parseHead
// ---------------------------------------------------------------------------

/**
 * @param {string} html
 * @returns {{title: string|null, description: string|null, canonical: string|null, robots: string|null,
 *            lang: string|null, ogImage: string|null, themeColor: string|null, jsonld: object[]}}
 */
export function parseHead(html) {
  const out = {
    title: null,
    description: null,
    canonical: null,
    robots: null,
    lang: null,
    ogImage: null,
    themeColor: null,
    jsonld: [],
  };
  const src = String(html ?? '');
  const tokens = tokenize(src);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'open') continue;
    const a = t.attrs;
    switch (t.name) {
      case 'html':
        if (a.lang && out.lang === null) out.lang = a.lang.trim();
        break;
      case 'title':
        if (out.title === null && tokens[i + 1]?.type === 'raw') {
          out.title = decodeEntities(tokens[i + 1].text).replace(/\s+/g, ' ').trim();
        }
        break;
      case 'meta': {
        const name = (a.name ?? '').toLowerCase();
        const property = (a.property ?? '').toLowerCase();
        const content = a.content ?? null;
        if (content === null) break;
        if (name === 'description' && out.description === null) out.description = content.trim();
        else if (name === 'robots' && out.robots === null) out.robots = content.trim();
        else if (name === 'theme-color' && out.themeColor === null) out.themeColor = content.trim();
        else if ((property === 'og:image' || name === 'og:image') && out.ogImage === null) out.ogImage = content.trim();
        break;
      }
      case 'link': {
        const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
        if (rel.includes('canonical') && a.href && out.canonical === null) out.canonical = a.href.trim();
        break;
      }
      case 'script': {
        const type = (a.type ?? '').toLowerCase().trim();
        if (type === 'application/ld+json' && tokens[i + 1]?.type === 'raw') {
          const raw = tokens[i + 1].text.trim();
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) out.jsonld.push(...parsed.filter((x) => x && typeof x === 'object'));
            else if (parsed && typeof parsed === 'object') out.jsonld.push(parsed);
          } catch {
            /* JSON-LD inválido: se ignora */
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Enlaces e imágenes
// ---------------------------------------------------------------------------

/**
 * Enlaces `<a href>` resueltos y normalizados contra `base`; solo mismo origen; sin duplicados.
 * @param {string} html
 * @param {string} base
 * @returns {string[]}
 */
export function extractLinks(html, base) {
  const seen = new Set();
  const out = [];
  for (const t of tokenize(html)) {
    if (t.type !== 'open' || (t.name !== 'a' && t.name !== 'area')) continue;
    if (typeof t.attrs.href !== 'string') continue;
    const url = normalizeUrl(t.attrs.href, base);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

function toDimension(v) {
  if (v === undefined || v === null) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Imágenes `<img>` con `src` absoluto (resuelto contra `base`), `alt`, `width`, `height`.
 * Omite `data:` URIs e imágenes sin `src`.
 * @param {string} html
 * @param {string} base
 * @returns {{src: string, alt: string|null, width: number|null, height: number|null}[]}
 */
export function extractImages(html, base) {
  const out = [];
  for (const t of tokenize(html)) {
    if (t.type !== 'open' || t.name !== 'img') continue;
    let src = t.attrs.src ?? t.attrs['data-src'] ?? null;
    if (!src || !src.trim()) continue;
    src = src.trim();
    if (/^data:/i.test(src)) continue;
    let abs;
    try {
      abs = new URL(src, base).toString();
    } catch {
      continue;
    }
    out.push({
      src: abs,
      alt: typeof t.attrs.alt === 'string' ? t.attrs.alt : null,
      width: toDimension(t.attrs.width),
      height: toDimension(t.attrs.height),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contenido principal
// ---------------------------------------------------------------------------

const NOISE_ELEMENTS = new Set(['header', 'nav', 'footer', 'aside', 'script', 'style', 'noscript', 'form', 'iframe', 'template']);
const NOISE_CLASS_RE = /(^|[\s_-])(cookie|popup|modal|share|comments?|sidebar|widget|menu|breadcrumbs?)([\s_-]|$)/i;
const CANDIDATE_ELEMENTS = new Set(['div', 'section', 'article', 'main', 'td', 'body', 'center', 'span']);

function isNoise(node) {
  if (NOISE_ELEMENTS.has(node.name)) return true;
  const cls = `${node.attrs.class ?? ''} ${node.attrs.id ?? ''}`;
  if (cls.trim() && NOISE_CLASS_RE.test(cls)) return true;
  const role = (node.attrs.role ?? '').toLowerCase();
  return role === 'navigation' || role === 'banner' || role === 'contentinfo' || role === 'complementary';
}

/** Elimina del árbol los nodos de ruido (muta el árbol). */
function pruneNoise(node) {
  if (!node.children) return;
  node.children = node.children.filter((c) => !(c.type === 'element' && isNoise(c)));
  for (const c of node.children) pruneNoise(c);
}

function scoreNode(node) {
  const text = nodeText(node);
  const textLen = text.length;
  if (textLen === 0) return { score: 0, textLen: 0 };
  let linkLen = 0;
  for (const a of findAll(node, (n) => n.name === 'a')) linkLen += nodeText(a).length;
  const paragraphs = findAll(node, (n) => n.name === 'p' || /^h[1-6]$/.test(n.name)).length;
  const linkDensity = linkLen / textLen;
  const score = (textLen - linkLen) * (1 - Math.min(linkDensity, 0.9)) + paragraphs * 20;
  return { score, textLen };
}

/**
 * Bloque de contenido principal.
 * `<main>` o `<article>` → `confidence: 'high'`; si no existen, el bloque con mayor densidad de texto
 * (excluyendo header/nav/footer/aside/formularios y clases de ruido) → `confidence: 'medium'`.
 * Devuelve el HTML exterior del bloque elegido.
 * @param {string} html
 * @returns {{html: string, confidence: 'high'|'medium'}}
 */
export function mainContent(html) {
  const tree = buildTree(html);
  const main = findFirst(tree, (n) => n.name === 'main' || (n.attrs.role ?? '').toLowerCase() === 'main');
  if (main) return { html: serialize(main), confidence: 'high' };
  const article = findFirst(tree, (n) => n.name === 'article');
  if (article) return { html: serialize(article), confidence: 'high' };

  const body = findFirst(tree, (n) => n.name === 'body') ?? tree;
  pruneNoise(body);

  const candidates = findAll(body, (n) => CANDIDATE_ELEMENTS.has(n.name));
  if (body.type === 'element') candidates.unshift(body);
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const { score } = scoreNode(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return { html: serialize(body), confidence: 'medium' };

  // Descender mientras un único hijo concentre casi todo el texto (bloque más ajustado).
  let node = best;
  for (;;) {
    const parentLen = nodeText(node).length;
    const kids = node.children.filter((c) => c.type === 'element' && CANDIDATE_ELEMENTS.has(c.name));
    const dense = kids.find((k) => nodeText(k).length >= parentLen * 0.9);
    if (!dense || parentLen === 0) break;
    node = dense;
  }
  return { html: serialize(node), confidence: 'medium' };
}

// ---------------------------------------------------------------------------
// Texto, conteo y hash
// ---------------------------------------------------------------------------

/**
 * Texto plano: sin etiquetas ni script/style, entidades decodificadas, espacios colapsados.
 * @param {string} html
 * @returns {string}
 */
export function textOf(html) {
  return nodeText(buildTree(html)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @returns {number}
 */
export function wordCount(text) {
  const t = String(text ?? '').trim();
  if (!t) return 0;
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * sha1 hex del texto normalizado (minúsculas, espacios colapsados, sin puntuación de borde).
 * @param {string} text
 * @returns {string}
 */
export function contentHash(text) {
  const normalized = String(text ?? '')
    .toLowerCase()
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(normalized, 'utf8').digest('hex');
}
