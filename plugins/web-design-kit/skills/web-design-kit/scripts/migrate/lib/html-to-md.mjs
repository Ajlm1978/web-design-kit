/**
 * html-to-md.mjs — conversión HTML → Markdown sin dependencias.
 *
 * Node >= 22, ESM, cero dependencias. Usa el árbol de `html.mjs`.
 *
 * Soporta: h1–h6, p, ul/ol (anidadas), a, img, strong/em (b/i), blockquote, pre/code, tablas simples,
 * br, hr. Elimina nav/header/footer/aside/script/style/form/iframe y bloques con clases
 * `cookie|popup|modal|share|comments|sidebar`. Dentro de un <article> se conserva su <header> (trae el h1)
 * pero se eliminan el <footer> y los bloques de meta del CMS (`entry-meta|post-meta|byline|posted-on|
 * tags-links|cat-links|entry-footer`): fecha, autor y etiquetas ya van en el frontmatter.
 * Los enlaces e imágenes se resuelven contra `baseUrl`; con `rootRelativeOrigin`, los que apuntan a ese
 * origen se escriben como ruta relativa a la raíz (`/servicios/`) para que no dependan del dominio viejo.
 * Con `isBrokenLink(absoluteUrl) → boolean`, los enlaces cuyo destino está roto en el sitio viejo se vuelcan
 * como texto plano (se conserva el ancla, se pierde el href) y se notifica con `onBrokenLink(absoluteUrl)`.
 *
 * htmlToMarkdown(html, {baseUrl, rootRelativeOrigin, isBrokenLink, onBrokenLink}) → string
 *   (termina en '\n'; bloques separados por línea en blanco).
 */

import { buildTree, decodeEntities } from './html.mjs';

const REMOVE_ELEMENTS = new Set([
  'nav', 'aside', 'script', 'style', 'noscript', 'form', 'iframe', 'template',
  'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'object', 'embed', 'video', 'audio',
]);
const REMOVE_CLASS_RE = /(^|[\s_-])(cookie|popup|modal|share|comments?|sidebar)([\s_-]|$)/i;
/** Meta de entrada que generan WordPress y temas afines (fecha, autor, etiquetas): ya está en el frontmatter. */
const ENTRY_META_CLASS_RE = /(^|\s)(entry-meta|post-meta|byline|posted-on|tags-links|cat-links|entry-footer|entry-utility|post-tags|post-categories)(\s|$)/i;

const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'main', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'details', 'summary',
  'body', 'html', 'center', 'fieldset',
]);

/** Marcador interno de salto de línea duro (<br>), convertido al final en "  \n". */
const HARD_BREAK = '\u0000br\u0000';

function hasAncestor(node, name) {
  for (let p = node.parent; p; p = p.parent) if (p.name === name) return true;
  return false;
}

function shouldRemove(node) {
  if (node.name === 'header') {
    // El header del sitio se elimina; el de un <article> (p. ej. `entry-header` con el h1) se conserva.
    return !hasAncestor(node, 'article');
  }
  // El footer del sitio y el de la entrada (`entry-footer`: etiquetas, categorías, compartir) se eliminan.
  if (node.name === 'footer') return true;
  if (REMOVE_ELEMENTS.has(node.name)) return true;
  const cls = `${node.attrs.class ?? ''} ${node.attrs.id ?? ''}`;
  if (cls.trim() === '') return false;
  if (REMOVE_CLASS_RE.test(cls)) return true;
  return hasAncestor(node, 'article') && ENTRY_META_CLASS_RE.test(node.attrs.class ?? '');
}

function resolveUrl(href, baseUrl, rootRelativeOrigin = '') {
  if (typeof href !== 'string') return '';
  const h = href.trim();
  if (!h) return '';
  if (!baseUrl) return h;
  try {
    const url = new URL(h, baseUrl);
    if (rootRelativeOrigin && url.origin === rootRelativeOrigin) return `${url.pathname}${url.search}${url.hash}`;
    return url.toString();
  } catch {
    return h;
  }
}

function escapeText(s) {
  // Escapar lo mínimo que rompería el Markdown en texto corrido.
  return s.replace(/([\\`*_[\]])/g, '\\$1');
}

/** Colapsa espacios de texto inline; `&nbsp;` pasa a espacio normal. */
function collapse(s) {
  return s.replace(/[ \t\r\n\f ]+/g, ' ');
}

/** Une bloques con una línea en blanco entre ellos. */
function joinBlocks(blocks) {
  return blocks.filter((b) => b !== null && b !== undefined && b.trim() !== '').join('\n\n');
}

function indent(text, pad) {
  return text
    .split('\n')
    .map((l) => (l.trim() === '' ? l : pad + l))
    .join('\n');
}

export function htmlToMarkdown(html, { baseUrl = '', rootRelativeOrigin = '', isBrokenLink = null, onBrokenLink = null } = {}) {
  const tree = buildTree(html);
  const md = renderChildrenAsBlocks(tree, { baseUrl, rootRelativeOrigin, isBrokenLink, onBrokenLink });
  const out = md.replace(/\n{3,}/g, '\n\n').trim();
  return out ? `${out}\n` : '';
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render del contenido inline de un nodo (texto corrido). */
function renderInline(node, ctx) {
  const parts = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      if (child.raw) continue;
      parts.push(escapeText(collapse(decodeEntities(child.text))));
      continue;
    }
    if (child.type !== 'element') continue;
    if (shouldRemove(child)) continue;
    const name = child.name;
    switch (name) {
      case 'br':
        parts.push(HARD_BREAK);
        break;
      case 'strong':
      case 'b': {
        const inner = renderInline(child, ctx).trim();
        if (inner) parts.push(`**${inner}**`);
        break;
      }
      case 'em':
      case 'i': {
        const inner = renderInline(child, ctx).trim();
        if (inner) parts.push(`*${inner}*`);
        break;
      }
      case 'code':
      case 'kbd':
      case 'samp': {
        const code = rawText(child);
        if (code) {
          const fence = code.includes('`') ? '``' : '`';
          parts.push(`${fence}${code}${fence}`);
        }
        break;
      }
      case 'a': {
        // Solo los enlaces se relativizan; las imágenes quedan absolutas para que extract-content pueda
        // casarlas con `images[].src` y reescribirlas a ../assets/ tras descargarlas.
        const href = resolveUrl(child.attrs.href, ctx.baseUrl, ctx.rootRelativeOrigin);
        const inner = renderInline(child, ctx).trim();
        if (href && ctx.isBrokenLink) {
          // H2-01: un enlace roto en el sitio viejo no se hereda; queda el texto del ancla.
          const absolute = resolveUrl(child.attrs.href, ctx.baseUrl);
          if (ctx.isBrokenLink(absolute)) {
            ctx.onBrokenLink?.(absolute);
            if (inner) parts.push(inner);
            break;
          }
        }
        if (!href) parts.push(inner);
        else if (!inner) parts.push(`<${href}>`);
        else parts.push(`[${inner}](${href})`);
        break;
      }
      case 'img': {
        const img = renderImage(child, ctx);
        if (img) parts.push(img);
        break;
      }
      case 'del':
      case 's':
      case 'strike': {
        const inner = renderInline(child, ctx).trim();
        if (inner) parts.push(`~~${inner}~~`);
        break;
      }
      default:
        if (BLOCKS.has(name)) {
          // Bloque dentro de un contexto inline: renderizar como bloque y separarlo con saltos.
          parts.push(`\n\n${renderBlock(child, ctx)}\n\n`);
        } else {
          parts.push(renderInline(child, ctx));
        }
    }
  }
  return parts.join('');
}

function rawText(node) {
  let s = '';
  const walk = (n) => {
    if (n.type === 'text') s += n.raw ? n.text : decodeEntities(n.text);
    else for (const c of n.children) walk(c);
  };
  walk(node);
  return s;
}

function renderImage(node, ctx) {
  const src = resolveUrl(node.attrs.src ?? node.attrs['data-src'], ctx.baseUrl);
  if (!src || /^data:/i.test(src)) return '';
  const alt = collapse(node.attrs.alt ?? '').trim().replace(/([[\]])/g, '\\$1');
  const title = node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : '';
  return `![${alt}](${src}${title})`;
}

/**
 * Limpia un párrafo inline: recorta espacios por línea, elimina líneas vacías de borde y convierte
 * los marcadores de <br> en saltos duros Markdown ("  \n").
 */
function finishInline(s) {
  const segments = s.split(HARD_BREAK).map((seg) =>
    seg
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/^\n+|\n+$/g, ''),
  );
  // Quitar <br> sobrantes al principio/final y consecutivos vacíos.
  while (segments.length && segments[0].trim() === '') segments.shift();
  while (segments.length && segments[segments.length - 1].trim() === '') segments.pop();
  return segments.filter((seg, i) => seg.trim() !== '' || segments[i - 1]?.trim() !== '').join('  \n').trim();
}

/** Renderiza los hijos de `node` agrupando texto/inline sueltos en párrafos implícitos. */
function renderChildrenAsBlocks(node, ctx) {
  const blocks = [];
  let inlineBuffer = [];
  const flush = () => {
    if (inlineBuffer.length === 0) return;
    const wrapper = { type: 'element', name: 'span', attrs: {}, children: inlineBuffer };
    const text = finishInline(renderInline(wrapper, ctx));
    if (text) blocks.push(text);
    inlineBuffer = [];
  };

  for (const child of node.children) {
    if (child.type === 'text') {
      if (!child.raw && child.text.trim() !== '') inlineBuffer.push(child);
      else if (!child.raw && inlineBuffer.length > 0) inlineBuffer.push(child);
      continue;
    }
    if (child.type !== 'element') continue;
    if (shouldRemove(child)) continue;
    if (BLOCKS.has(child.name)) {
      flush();
      const rendered = renderBlock(child, ctx);
      if (rendered.trim()) blocks.push(rendered);
    } else {
      inlineBuffer.push(child);
    }
  }
  flush();
  return joinBlocks(blocks);
}

function renderBlock(node, ctx) {
  const name = node.name;
  if (/^h[1-6]$/.test(name)) {
    const level = Number(name[1]);
    const text = finishInline(renderInline(node, ctx)).replace(/\s*\n\s*/g, ' ');
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }
  switch (name) {
    case 'p':
    case 'figcaption':
    case 'address':
    case 'summary':
    case 'dt':
    case 'dd':
      return finishInline(renderInline(node, ctx));
    case 'hr':
      return '---';
    case 'pre':
      return renderPre(node);
    case 'blockquote': {
      const inner = renderChildrenAsBlocks(node, ctx);
      return inner
        .split('\n')
        .map((l) => (l.trim() === '' ? '>' : `> ${l}`))
        .join('\n');
    }
    case 'ul':
    case 'ol':
      return renderList(node, ctx);
    case 'li':
      // <li> huérfano fuera de lista
      return renderListItem(node, ctx, '- ');
    case 'table':
      return renderTable(node, ctx);
    default:
      // div/section/article/figure/main/body…: contenedores transparentes
      return renderChildrenAsBlocks(node, ctx);
  }
}

function renderPre(node) {
  let code = rawText(node).replace(/^\n+/, '').replace(/\n+$/, '');
  const codeChild = node.children.find((c) => c.type === 'element' && c.name === 'code');
  const langMatch = (codeChild?.attrs.class ?? node.attrs.class ?? '').match(/(?:language|lang)-([\w+-]+)/);
  const lang = langMatch ? langMatch[1] : '';
  let fence = '```';
  while (code.includes(fence)) fence += '`';
  return `${fence}${lang}\n${code}\n${fence}`;
}

function renderList(node, ctx) {
  const ordered = node.name === 'ol';
  const start = ordered ? parseInt(node.attrs.start ?? '1', 10) || 1 : 1;
  const items = node.children.filter((c) => c.type === 'element' && c.name === 'li' && !shouldRemove(c));
  const lines = [];
  items.forEach((li, i) => {
    const marker = ordered ? `${start + i}. ` : '- ';
    const rendered = renderListItem(li, ctx, marker);
    if (rendered.trim()) lines.push(rendered);
  });
  return lines.join('\n');
}

function renderListItem(li, ctx, marker) {
  const pad = ' '.repeat(marker.length);
  // Separar: contenido inline/bloques simples vs sublistas.
  const sublists = [];
  const rest = [];
  for (const c of li.children) {
    if (c.type === 'element' && (c.name === 'ul' || c.name === 'ol')) sublists.push(c);
    else rest.push(c);
  }
  const head = renderChildrenAsBlocks({ type: 'element', name: 'li', attrs: {}, children: rest }, ctx);
  const headLines = head.split('\n');
  let out = `${marker}${headLines[0] ?? ''}`;
  if (headLines.length > 1) out += `\n${indent(headLines.slice(1).join('\n'), pad)}`;
  for (const sub of sublists) {
    const rendered = renderList(sub, ctx);
    if (rendered.trim()) out += `\n${indent(rendered, pad)}`;
  }
  return out;
}

function renderTable(node, ctx) {
  const rows = [];
  const collectRows = (n) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if (c.name === 'tr') rows.push(c);
      else if (['thead', 'tbody', 'tfoot'].includes(c.name)) collectRows(c);
    }
  };
  collectRows(node);
  if (rows.length === 0) return '';

  const cellText = (cell) =>
    finishInline(renderInline(cell, ctx)).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
  const matrix = rows.map((tr) =>
    tr.children.filter((c) => c.type === 'element' && (c.name === 'td' || c.name === 'th')).map(cellText),
  );
  const width = Math.max(...matrix.map((r) => r.length));
  if (width === 0) return '';
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];

  const firstIsHeader =
    rows[0].parent?.name === 'thead' ||
    rows[0].children.filter((c) => c.type === 'element').every((c) => c.name === 'th');
  let header;
  let body;
  if (firstIsHeader) {
    header = pad(matrix[0]);
    body = matrix.slice(1).map(pad);
  } else {
    header = Array(width).fill('');
    body = matrix.map(pad);
  }
  const line = (cells) => `| ${cells.join(' | ')} |`;
  const out = [line(header), line(Array(width).fill('---')), ...body.map(line)];
  return out.join('\n');
}
