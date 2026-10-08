/**
 * lib.test.mjs — pruebas de la librería compartida de migración (url, html, html-to-md).
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * Requiere los fixtures de evals/fixtures/wp-like (generados por evals/fixtures/generate.mjs).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { normalizeUrl, sameOrigin, slugFromPath } from '../lib/url.mjs';
import {
  parseHead,
  extractLinks,
  extractImages,
  mainContent,
  textOf,
  wordCount,
  contentHash,
} from '../lib/html.mjs';
import { htmlToMarkdown } from '../lib/html-to-md.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixtures = resolve(repoRoot, 'evals/fixtures/wp-like');

function fixture(path) {
  const file = resolve(fixtures, path);
  assert.ok(existsSync(file), `fixture no encontrado: ${file} (corre evals/fixtures/generate.mjs)`);
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// url.mjs
// ---------------------------------------------------------------------------

describe('url.mjs', () => {
  test('normalizeUrl quita fragmento y utm_*, fuerza barra final', () => {
    assert.equal(normalizeUrl('/a#x?utm_source=1', 'https://s.com'), 'https://s.com/a/');
    assert.equal(normalizeUrl('/a?utm_source=1#x', 'https://s.com'), 'https://s.com/a/');
  });

  test('normalizeUrl conserva parámetros que no son utm_*', () => {
    assert.equal(normalizeUrl('/a?page=2&utm_medium=x', 'https://s.com'), 'https://s.com/a/?page=2');
  });

  test('normalizeUrl devuelve null para otro origen o esquemas no http', () => {
    assert.equal(normalizeUrl('https://other.com/', 'https://s.com'), null);
    assert.equal(normalizeUrl('mailto:a@b.com', 'https://s.com'), null);
    assert.equal(normalizeUrl('tel:+123', 'https://s.com'), null);
    assert.equal(normalizeUrl('javascript:void(0)', 'https://s.com'), null);
    assert.equal(normalizeUrl('', 'https://s.com'), null);
  });

  test('normalizeUrl mantiene rutas con extensión sin añadir barra final', () => {
    assert.equal(normalizeUrl('/docs/guia.html', 'https://s.com'), 'https://s.com/docs/guia.html');
    assert.equal(normalizeUrl('/files/folleto.pdf#p=2', 'https://s.com'), 'https://s.com/files/folleto.pdf');
  });

  test('normalizeUrl resuelve rutas relativas y la raíz', () => {
    assert.equal(normalizeUrl('../b', 'https://s.com/a/x/'), 'https://s.com/a/b/');
    assert.equal(normalizeUrl('https://s.com', 'https://s.com'), 'https://s.com/');
    assert.equal(normalizeUrl('#top', 'https://s.com/a/'), 'https://s.com/a/');
  });

  test('sameOrigin compara esquema+host+puerto', () => {
    assert.equal(sameOrigin('https://s.com/a', 'https://s.com/b'), true);
    assert.equal(sameOrigin('https://s.com/a', 'http://s.com/a'), false);
    assert.equal(sameOrigin('https://s.com/a', 'https://www.s.com/a'), false);
    assert.equal(sameOrigin('nope', 'https://s.com/a'), false);
  });

  test('slugFromPath produce slugs estables', () => {
    assert.equal(slugFromPath('/'), 'index');
    assert.equal(slugFromPath('/blog/post-01/'), 'blog-post-01');
    assert.equal(slugFromPath('/Servicios/Reparación de Autos/'), 'servicios-reparacion-de-autos');
    assert.equal(slugFromPath('/docs/guia.html'), 'docs-guia');
  });
});

// ---------------------------------------------------------------------------
// html.mjs
// ---------------------------------------------------------------------------

describe('html.mjs', () => {
  test('parseHead de /contacto/ devuelve JSON-LD LocalBusiness y metadatos', () => {
    const head = parseHead(fixture('contacto/index.html'));
    assert.equal(head.jsonld[0]['@type'], 'LocalBusiness');
    assert.equal(head.jsonld[0].telephone, '+13055550123');
    assert.equal(head.themeColor, '#0f766e');
    assert.equal(head.lang, 'es');
    assert.ok(typeof head.title === 'string' && head.title.length > 0);
    assert.ok(typeof head.description === 'string' && head.description.length > 0);
    assert.equal(head.canonical, 'http://localhost/contacto/');
  });

  test('parseHead tolera orden de atributos, mayúsculas y comillas simples', () => {
    const html = `<!DOCTYPE html><HTML LANG='en'><HEAD>
      <TITLE>Hola &amp; adiós</TITLE>
      <META content='Desc &quot;x&quot;' NAME="description">
      <meta property='og:image' content="/img/og.png" />
      <meta name=robots content="noindex, follow">
      <link href='/canon/' rel='canonical'>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>
      </HEAD><body></body></HTML>`;
    const head = parseHead(html);
    assert.equal(head.title, 'Hola & adiós');
    assert.equal(head.description, 'Desc "x"');
    assert.equal(head.ogImage, '/img/og.png');
    assert.equal(head.robots, 'noindex, follow');
    assert.equal(head.canonical, '/canon/');
    assert.equal(head.lang, 'en');
    assert.equal(head.themeColor, null);
    assert.equal(head.jsonld.length, 1);
    assert.equal(head.jsonld[0].name, 'X');
  });

  test('parseHead devuelve null para lo ausente y descarta JSON-LD inválido', () => {
    const head = parseHead('<html><head><script type="application/ld+json">{nope</script></head></html>');
    assert.equal(head.title, null);
    assert.equal(head.description, null);
    assert.equal(head.canonical, null);
    assert.deepEqual(head.jsonld, []);
  });

  test('extractLinks resuelve contra base, normaliza y omite externos/mailto', () => {
    const html = `<a href="/a/">A</a><A HREF='b#frag'>B</A><a href="https://example.org/">ext</a>
      <a href="mailto:x@y.z">m</a><a href="/a/?utm_source=t">dup</a><a>sin href</a>`;
    const links = extractLinks(html, 'https://s.com/');
    assert.deepEqual(links, ['https://s.com/a/', 'https://s.com/b/']);
  });

  test('extractLinks del home del fixture incluye internos y no el externo', () => {
    const links = extractLinks(fixture('index.html'), 'http://localhost/');
    assert.ok(links.includes('http://localhost/servicios/'));
    assert.ok(!links.some((l) => l.startsWith('https://example.org')));
  });

  test('extractImages devuelve src absoluto, alt, width y height', () => {
    const html = `<img alt="Logo &amp; marca" src="/logo.svg" width="120" height='40'>
      <IMG SRC='img/a.jpg' />
      <img src="data:image/png;base64,xxx" alt="inline">
      <img alt="sin src">`;
    const imgs = extractImages(html, 'https://s.com/blog/p/');
    assert.deepEqual(imgs, [
      { src: 'https://s.com/logo.svg', alt: 'Logo & marca', width: 120, height: 40 },
      { src: 'https://s.com/blog/p/img/a.jpg', alt: null, width: null, height: null },
    ]);
  });

  test('extractImages de un post del fixture trae alt/width/height', () => {
    const imgs = extractImages(fixture('blog/post-01/index.html'), 'http://localhost/blog/post-01/');
    const content = imgs.filter((i) => i.src.includes('/wp-content/'));
    assert.ok(content.length >= 1 && content.length <= 3);
    for (const img of content) {
      assert.equal(typeof img.alt, 'string');
      assert.equal(typeof img.width, 'number');
      assert.equal(typeof img.height, 'number');
    }
  });

  test('mainContent usa <main>/<article> con confidence high', () => {
    const a = mainContent(fixture('nosotros/index.html'));
    assert.equal(a.confidence, 'high');
    assert.ok(a.html.includes('<p'));
    const b = mainContent(fixture('blog/post-01/index.html'));
    assert.equal(b.confidence, 'high');
    assert.ok(/<h1/i.test(b.html));
  });

  test('mainContent sin <main> ni <article> elige el bloque denso con confidence medium', () => {
    const r = mainContent(fixture('galeria/index.html'));
    assert.equal(r.confidence, 'medium');
    assert.ok(/class="content"/.test(r.html), 'debe elegir el div.content');
    assert.ok(!/<nav/i.test(r.html), 'no debe incluir la nav');
  });

  test('textOf elimina etiquetas, script/style y decodifica entidades', () => {
    const t = textOf('<p>Uno &amp; <b>dos</b>&nbsp;&lt;tres&gt;</p><script>var x=1;</script><style>p{}</style><p>&#39;cuatro&#x27; &quot;q&quot; &#233;</p>');
    assert.equal(t, "Uno & dos <tres> 'cuatro' \"q\" é");
  });

  test('wordCount cuenta palabras', () => {
    assert.equal(wordCount('  hola   mundo\ncruel '), 3);
    assert.equal(wordCount(''), 0);
    assert.equal(wordCount('año único — sí'), 3, 'un guion largo suelto no es palabra');
  });

  test('contentHash es sha1 hex de 40 chars, estable y normaliza espacios/mayúsculas', () => {
    const h = contentHash('Hola mundo');
    assert.match(h, /^[0-9a-f]{40}$/);
    assert.equal(h, contentHash('  hola   MUNDO '));
    assert.notEqual(h, contentHash('otra cosa'));
  });

  test('contentHash coincide entre /nosotros/ y /duplicada/', () => {
    const a = textOf(mainContent(fixture('nosotros/index.html')).html);
    const b = textOf(mainContent(fixture('duplicada/index.html')).html);
    assert.equal(contentHash(a), contentHash(b));
    const c = textOf(mainContent(fixture('servicios/index.html')).html);
    assert.notEqual(contentHash(a), contentHash(c));
  });
});

// ---------------------------------------------------------------------------
// html-to-md.mjs
// ---------------------------------------------------------------------------

describe('html-to-md.mjs', () => {
  test('ejemplo del plan: h2 + lista + párrafo con enlace relativo', () => {
    const md = htmlToMarkdown('<h2>A</h2><ul><li>x</li></ul><p>b <a href="/c/">c</a></p>', {
      baseUrl: 'https://s.com',
    });
    assert.equal(md, '## A\n\n- x\n\nb [c](https://s.com/c/)\n');
  });

  test('encabezados h1–h6, énfasis, br y hr', () => {
    const md = htmlToMarkdown(
      '<h1>T</h1><h3>S</h3><h6>Z</h6><p>a<br>b <strong>f</strong> <em>i</em> <b>g</b> <i>h</i></p><hr>',
      { baseUrl: 'https://s.com' },
    );
    assert.equal(md, '# T\n\n### S\n\n###### Z\n\na  \nb **f** *i* **g** *h*\n\n---\n');
  });

  test('listas ordenadas y anidadas', () => {
    const md = htmlToMarkdown('<ol><li>uno</li><li>dos<ul><li>sub</li></ul></li></ol>', { baseUrl: 'https://s.com' });
    assert.equal(md, '1. uno\n2. dos\n   - sub\n');
  });

  test('imágenes, blockquote, code y pre', () => {
    const md = htmlToMarkdown(
      '<p><img src="/i.jpg" alt="Foto"></p><blockquote><p>cita</p></blockquote><p>usa <code>x&lt;y</code></p><pre><code>line1\nline2</code></pre>',
      { baseUrl: 'https://s.com/blog/' },
    );
    assert.equal(md, '![Foto](https://s.com/i.jpg)\n\n> cita\n\nusa `x<y`\n\n```\nline1\nline2\n```\n');
  });

  test('tablas simples', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
      { baseUrl: 'https://s.com' },
    );
    assert.equal(md, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  });

  test('elimina nav/header/footer/aside/script/style/form/iframe y clases de ruido', () => {
    const md = htmlToMarkdown(
      `<header><h1>Logo</h1></header><nav><a href="/x/">x</a></nav>
       <div class="cookie-banner"><p>cookies</p></div>
       <div class="widget sidebar"><p>side</p></div>
       <div id="comments" class="comments-area"><p>coment</p></div>
       <div class="share-buttons">share</div><div class="modal">m</div><div class="popup">p</div>
       <script>var a=1;</script><style>p{}</style><form><input></form><iframe src="x"></iframe>
       <p>real</p><aside>a</aside><footer>f</footer>`,
      { baseUrl: 'https://s.com' },
    );
    assert.equal(md, 'real\n');
  });

  test('decodifica entidades, colapsa espacios y mantiene enlaces absolutos', () => {
    const md = htmlToMarkdown(
      '<p>Tom &amp;\n   Jerry&nbsp;&#8212; <a href="https://example.org/?a=1&amp;b=2">ext</a></p>',
      { baseUrl: 'https://s.com' },
    );
    assert.equal(md, 'Tom & Jerry — [ext](https://example.org/?a=1&b=2)\n');
  });

  test('convierte el contenido principal de un post del fixture', () => {
    const { html } = mainContent(fixture('blog/post-01/index.html'));
    const md = htmlToMarkdown(html, { baseUrl: 'http://localhost/blog/post-01/' });
    assert.match(md, /^# /m);
    assert.match(md, /!\[[^\]]*\]\(http:\/\/localhost\/wp-content\//);
    assert.ok(!/<[a-z]+[^>]*>/i.test(md), 'no deben quedar etiquetas HTML');
  });
});
