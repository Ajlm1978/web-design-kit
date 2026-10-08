/**
 * extract.test.mjs — pruebas de extract-content.mjs, lib/brief.mjs y lib/brand.mjs.
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * Requiere evals/fixtures/wp-like (generado por evals/fixtures/generate.mjs).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { scan } from '../scan-source.mjs';
import { extract } from '../extract-content.mjs';
import { validateBrief, emptyBrief } from '../lib/brief.mjs';
import { hexToOklch, parseColor, extractCssColors, extractCssFonts, fontsourcePackage } from '../lib/brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixtures = resolve(repoRoot, 'evals/fixtures');
const wpLike = join(fixtures, 'wp-like');
const scriptPath = resolve(here, '../extract-content.mjs');

const temps = [];
function tmp(prefix = 'wdk-extract-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Frontmatter YAML plano → objeto (solo claves escalares de primer nivel y listas de bloque). */
function parseFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  assert.ok(m, 'el archivo debe empezar con frontmatter YAML');
  const out = {};
  let currentList = null;
  for (const line of m[1].split('\n')) {
    const item = /^ {2}- (.*)$/.exec(line);
    if (item && currentList) {
      out[currentList].push(item[1]);
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s(.*))?$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw === undefined || raw === '') {
      out[key] = [];
      currentList = key;
      continue;
    }
    currentList = null;
    let v = raw.trim();
    if (v === 'null') v = null;
    else if (v === '[]') v = [];
    else if (/^".*"$/.test(v)) v = JSON.parse(v);
    out[key] = v;
  }
  return { data: out, body: md.slice(m[0].length) };
}

// ---------------------------------------------------------------------------
// brand.mjs
// ---------------------------------------------------------------------------

describe('brand.mjs', () => {
  test('hexToOklch: blanco ≈ L 100, C 0', () => {
    const c = hexToOklch('#ffffff');
    assert.ok(Math.abs(c.L - 100) < 0.1, `L=${c.L}`);
    assert.ok(c.C < 0.001);
    assert.match(c.css, /^oklch\(100\.0% 0\.000 \d+\)$/);
  });

  test('hexToOklch: #0f766e tiene L entre 40 y 60 y hue verde-azulado', () => {
    const c = hexToOklch('#0f766e');
    assert.ok(c.L > 40 && c.L < 60, `L=${c.L}`);
    assert.ok(c.C > 0.03);
    assert.ok(c.H > 150 && c.H < 210, `H=${c.H}`);
    assert.match(c.css, /^oklch\(\d{1,2}\.\d% 0\.\d{3} \d{1,3}\)$/);
  });

  test('parseColor acepta #rgb, #rrggbb y rgb()/rgba()', () => {
    assert.equal(parseColor('#fff'), '#ffffff');
    assert.equal(parseColor('#0F766E'), '#0f766e');
    assert.equal(parseColor('rgb(15, 118, 110)'), '#0f766e');
    assert.equal(parseColor('rgba(15,118,110,.5)'), '#0f766e');
    assert.equal(parseColor('red'), null);
  });

  test('extractCssColors: top por frecuencia sin blancos/negros/grises', () => {
    const css = readFileSync(join(wpLike, 'style.css'), 'utf8');
    const colors = extractCssColors(css);
    assert.equal(colors[0].hex, '#0f766e');
    assert.equal(colors[1].hex, '#f59e0b');
    assert.ok(!colors.some((c) => c.hex === '#ffffff' || c.hex === '#111827' || c.hex === '#e5e7eb'));
  });

  test('extractCssFonts: display de h1/h2, body de body/p', () => {
    const css = readFileSync(join(wpLike, 'style.css'), 'utf8');
    const fonts = extractCssFonts(css);
    assert.equal(fonts.display, 'Playfair Display');
    assert.equal(fonts.body, 'Inter');
  });

  test('fontsourcePackage: variable cuando existe, estático si no, null si desconocida', () => {
    assert.equal(fontsourcePackage('Playfair Display'), '@fontsource-variable/playfair-display');
    assert.equal(fontsourcePackage('inter'), '@fontsource-variable/inter');
    assert.equal(fontsourcePackage('Lato'), '@fontsource/lato');
    assert.equal(fontsourcePackage('Comic Sans MS'), null);
  });
});

// ---------------------------------------------------------------------------
// brief.mjs
// ---------------------------------------------------------------------------

describe('brief.mjs', () => {
  test('validateBrief({}) lista name entre los errores', () => {
    const r = validateBrief({});
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('name')), r.errors.join('\n'));
    assert.ok(r.errors.some((e) => e.includes('version')));
  });

  test('emptyBrief() es válido tras rellenar los obligatorios', () => {
    const b = emptyBrief();
    b.name = 'PLACEHOLDER';
    b.type = 'corporativo';
    b.language = 'es';
    b.locale = 'es_US';
    const r = validateBrief(b);
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
  });

  test('validateBrief rechaza enums y confidence inválidos', () => {
    const b = emptyBrief();
    Object.assign(b, { name: 'X', type: 'tienda', language: 'es', locale: 'es_US' });
    b.sources['contact.phone'] = { from: 'x', confidence: 'alta' };
    const r = validateBrief(b);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('type')));
    assert.ok(r.errors.some((e) => e.includes('sources.contact.phone')));
  });
});

// ---------------------------------------------------------------------------
// extract-content.mjs sobre wp-like
// ---------------------------------------------------------------------------

describe('extract-content.mjs (wp-like)', () => {
  let out;
  let invDir;
  let inventory;
  let result;
  let brief;

  before(async () => {
    invDir = tmp('wdk-extract-inv-');
    inventory = await scan(wpLike, { out: invDir });
    out = tmp();
    result = await extract(inventory, { out, inventoryDir: invDir, sourceRoot: wpLike });
    brief = JSON.parse(readFileSync(join(out, 'brief.json'), 'utf8'));
  });

  test('H-01: content/blog/<último-segmento>.md para posts y content/pages/<slug>.md para páginas', () => {
    const blog = readdirSync(join(out, 'content', 'blog')).filter((f) => f.endsWith('.md'));
    const pages = readdirSync(join(out, 'content', 'pages')).filter((f) => f.endsWith('.md'));
    assert.equal(blog.length, 30);
    assert.equal(pages.length, 21);
    assert.ok(blog.includes('post-01.md'), 'el archivo del post conserva el slug de la URL (/blog/post-01/ → post-01.md)');
    assert.ok(!blog.includes('blog-post-01.md'));
    assert.ok(pages.includes('index.md'));
    assert.ok(pages.includes('contacto.md'));
    assert.ok(pages.includes('tag-aceite.md'));
    assert.ok(!existsSync(join(out, 'content', 'contacto.md')), 'ya no se escribe plano en content/');
    assert.equal(result.files.length, 51);
  });

  test('H-01: frontmatter lleva path (ruta original) y brief.pages[] lleva path, targetPath y file', () => {
    const { data } = parseFrontmatter(readFileSync(join(out, 'content', 'blog', 'post-01.md'), 'utf8'));
    assert.equal(data.path, '/blog/post-01/');
    const post = brief.pages.find((p) => p.sourceUrl === 'http://localhost/blog/post-01/');
    assert.deepEqual(post, {
      sourceUrl: 'http://localhost/blog/post-01/',
      title: 'Cómo saber cuándo cambiar el aceite (1)',
      slug: 'post-01',
      type: 'post',
      path: '/blog/post-01/',
      targetPath: '/blog/post-01/',
      file: 'blog/post-01.md',
    });
    const contacto = brief.pages.find((p) => p.sourceUrl === 'http://localhost/contacto/');
    assert.equal(contacto.path, '/contacto/');
    assert.equal(contacto.targetPath, '/contacto/');
    assert.equal(contacto.file, 'pages/contacto.md');
    assert.ok(brief.pages.every((p) => p.targetPath === p.path), 'por defecto la ruta no cambia');
  });

  test('H-01: un post fuera de /blog/ (permalink por fecha) apunta a /blog/<slug>/ como targetPath', async () => {
    const page = inventory.pages.find((p) => p.url === 'http://localhost/blog/post-02/');
    const moved = { ...page, url: 'http://localhost/2024/02/post-02/', finalUrl: 'http://localhost/2024/02/post-02/' };
    const inv = { ...inventory, pages: inventory.pages.map((p) => (p === page ? moved : p)) };
    const out5 = tmp();
    const r = await extract(inv, { out: out5, inventoryDir: invDir, sourceRoot: wpLike });
    const entry = r.brief.pages.find((p) => p.sourceUrl === 'http://localhost/2024/02/post-02/');
    assert.equal(entry.type, 'post');
    assert.equal(entry.path, '/2024/02/post-02/');
    assert.equal(entry.targetPath, '/blog/post-02/');
    assert.equal(entry.file, 'blog/post-02.md');
    assert.ok(existsSync(join(out5, 'content', 'blog', 'post-02.md')));
  });

  test('contacto.md: type page, confidence high y cuerpo Markdown', () => {
    const { data, body } = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'contacto.md'), 'utf8'));
    assert.equal(data.type, 'page');
    assert.equal(data.sourceUrl, 'http://localhost/contacto/');
    assert.equal(data.confidence, 'high');
    assert.match(body, /^## Horario/m);
    assert.ok(!body.includes('wpcf7'), 'el formulario no debe aparecer');
  });

  test('H-06: el título pierde el sufijo " - <nombre del sitio>"', () => {
    const { data } = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'contacto.md'), 'utf8'));
    assert.equal(data.title, 'Contacto');
    const home = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'index.md'), 'utf8')).data;
    assert.equal(home.title, 'Taller mecánico en Miami');
    assert.ok(brief.pages.every((p) => !/ - Taller Demo$/.test(p.title ?? '')), 'brief.pages[].title también limpio');
  });

  test('H-02: el H1 igual al título no se repite en el cuerpo', () => {
    const { body } = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'contacto.md'), 'utf8'));
    assert.ok(!/^# /m.test(body), `no debe quedar ningún H1 en el cuerpo:\n${body.slice(0, 200)}`);
    assert.match(body, /^Estamos en el corazón de Miami/m, 'el primer párrafo se conserva');
    const post = parseFrontmatter(readFileSync(join(out, 'content', 'blog', 'post-01.md'), 'utf8')).body;
    assert.ok(!/^# /m.test(post));
  });

  test('H-07: enlaces internos en ruta relativa a la raíz y sin meta de WP (Publicado el…, Etiquetas:)', () => {
    const { body } = parseFrontmatter(readFileSync(join(out, 'content', 'blog', 'post-01.md'), 'utf8'));
    // Enlaces (no imágenes: esas quedan absolutas hasta que --download-images las reescribe a ../assets/).
    assert.ok(!/(^|[^!])\[[^\]]*\]\(http:\/\/localhost\//.test(body), `quedan enlaces absolutos al origen:\n${body}`);
    assert.match(body, /\[servicios\]\(\/servicios\/\)/);
    assert.ok(!/^Publicado el /m.test(body));
    assert.ok(!/^Etiquetas:/m.test(body));
    assert.ok(!body.includes('/author/'), 'la línea de autor es frontmatter, no cuerpo');
    // Los enlaces externos se conservan absolutos.
    const home = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'index.md'), 'utf8')).body;
    assert.ok(home.includes('](https://example.org/)'));
    assert.ok(home.includes('](/precios/)'));
  });

  test('H2-01: los enlaces internos rotos del sitio viejo se convierten en texto plano y se avisa', () => {
    const home = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'index.md'), 'utf8')).body;
    assert.ok(!home.includes('/no-existe-1/'), `el enlace roto sigue en la home:\n${home}`);
    assert.ok(home.includes('promoción caducada'), 'el texto del enlace se conserva');
    const faq = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'faq.md'), 'utf8')).body;
    assert.ok(!faq.includes('/no-existe-3/'));
    assert.ok(faq.includes('listado de aseguradoras'));
    const servicios = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'servicios.md'), 'utf8')).body;
    assert.ok(!servicios.includes('/no-existe-2/'));
    // Los enlaces válidos siguen siendo enlaces.
    assert.ok(servicios.includes('](/precios/)') && servicios.includes('](/contacto/)'));
    const removed = result.warnings.filter((w) => w.startsWith('Enlace roto eliminado: '));
    assert.ok(removed.includes('Enlace roto eliminado: / → /no-existe-1/'), JSON.stringify(removed));
    assert.ok(removed.includes('Enlace roto eliminado: /faq/ → /no-existe-3/'), JSON.stringify(removed));
    assert.ok(removed.includes('Enlace roto eliminado: /servicios/ → /no-existe-2/'), JSON.stringify(removed));
  });

  test('H2-01: con inventario de URL, una página con status ≥ 400 también cuenta como destino roto', async () => {
    const invDir2 = tmp('wdk-extract-inv-url-');
    const inv = {
      ...inventory,
      source: { ...inventory.source, kind: 'url', origin: 'http://localhost', root: null },
      pages: [...inventory.pages, { url: 'http://localhost/no-existe-1/', status: 404, finalUrl: 'http://localhost/no-existe-1/', links: [], rawFile: null }],
    };
    cpSync(join(invDir, 'raw'), join(invDir2, 'raw'), { recursive: true }); // mismo raw/ que la carpeta escaneada
    const out2 = tmp();
    const r = await extract(inv, { out: out2, inventoryDir: invDir2, sourceRoot: wpLike });
    const home = parseFrontmatter(readFileSync(join(out2, 'content', 'pages', 'index.md'), 'utf8')).body;
    assert.ok(!home.includes('/no-existe-1/'));
    assert.ok(r.warnings.includes('Enlace roto eliminado: / → /no-existe-1/'), JSON.stringify(r.warnings));
    // /no-existe-2/ no está en pages ni en skipped y el inventario es de URL → "no rastreado", no roto: se conserva.
    const servicios = parseFrontmatter(readFileSync(join(out2, 'content', 'pages', 'servicios.md'), 'utf8')).body;
    assert.ok(servicios.includes('](/no-existe-2/)'), servicios);
  });

  test('posts: type post con date, author y tags', () => {
    const { data } = parseFrontmatter(readFileSync(join(out, 'content', 'blog', 'post-01.md'), 'utf8'));
    assert.equal(data.type, 'post');
    assert.match(String(data.date), /^2024-01-08/);
    assert.equal(data.author, 'Ana Pérez');
    assert.ok(Array.isArray(data.tags) && data.tags.length >= 1);
    const posts = readdirSync(join(out, 'content', 'blog'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => parseFrontmatter(readFileSync(join(out, 'content', 'blog', f), 'utf8')).data);
    assert.equal(posts.length, 30);
    assert.ok(posts.every((p) => p.type === 'post' && p.date));
  });

  test('el índice del blog y los archivos /tag/ son page, no post', () => {
    const { data } = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'blog.md'), 'utf8'));
    assert.equal(data.type, 'page');
    const tag = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'tag-aceite.md'), 'utf8')).data;
    assert.equal(tag.type, 'page');
    assert.equal(tag.path, '/tag/aceite/');
  });

  test('galeria.md (sin <main>) → confidence medium', () => {
    const { data } = parseFrontmatter(readFileSync(join(out, 'content', 'pages', 'galeria.md'), 'utf8'));
    assert.equal(data.confidence, 'medium');
    assert.ok(data.images.length >= 3);
  });

  test('brief: contacto desde JSON-LD con confidence high', () => {
    assert.equal(brief.contact.phone, '+13055550123');
    assert.equal(brief.sources['contact.phone'].confidence, 'high');
    assert.equal(brief.sources['contact.phone'].from, 'http://localhost/contacto/');
    assert.equal(brief.contact.email, 'hola@taller-demo.example');
    assert.equal(brief.contact.address.postalCode, '33125');
    assert.equal(brief.contact.address.addressCountry, 'US');
    assert.deepEqual(brief.contact.openingHours, ['Mo-Fr 09:00-17:00']);
    assert.equal(brief.sources['contact.openingHours'].confidence, 'high');
  });

  test('brief: name, type local, language/locale', () => {
    assert.equal(brief.version, 1);
    assert.equal(brief.name, 'Taller Demo');
    assert.equal(brief.sources.name.confidence, 'high');
    assert.equal(brief.type, 'local');
    assert.equal(brief.language, 'es');
    assert.equal(brief.locale, 'es_US');
  });

  test('brief: marca (logo, colores OKLCH, fuentes fontsource)', () => {
    assert.equal(brief.brand.logo, 'http://localhost/logo.svg');
    assert.equal(brief.sources['brand.logo'].confidence, 'high');
    const teal = brief.brand.colors.find((c) => c.hex === '#0f766e');
    assert.ok(teal, 'theme-color debe estar');
    assert.ok(teal.oklch.startsWith('oklch('));
    assert.equal(teal.role, 'primary');
    assert.ok(brief.brand.colors.some((c) => c.hex === '#f59e0b'));
    assert.ok(!brief.brand.colors.some((c) => c.hex === '#ffffff'));
    const display = brief.brand.fonts.find((f) => f.role === 'display');
    assert.deepEqual(display, {
      family: 'Playfair Display',
      role: 'display',
      fontsource: '@fontsource-variable/playfair-display',
    });
    const body = brief.brand.fonts.find((f) => f.role === 'body');
    assert.equal(body.family, 'Inter');
    assert.equal(body.fontsource, '@fontsource-variable/inter');
  });

  test('brief: servicios desde h2 de /servicios/', () => {
    assert.ok(brief.services.length >= 4);
    const titles = brief.services.map((s) => s.title);
    assert.ok(titles.includes('Frenos'));
    assert.ok(titles.includes('Diagnóstico electrónico'));
    assert.equal(brief.services[0].sourceUrl, 'http://localhost/servicios/');
    assert.equal(brief.sources.services.confidence, 'medium');
  });

  test('brief: pages, migration y validez contra el schema', () => {
    assert.equal(brief.pages.length, 51);
    assert.equal(brief.migration.inventoryCount, 51);
    assert.equal(brief.migration.posts, 30);
    assert.equal(brief.migration.redirectsPlanned, null);
    const r = validateBrief(brief);
    assert.deepEqual(r.errors, []);
    assert.equal(r.ok, true);
    assert.equal(result.brief.name, brief.name);
    assert.equal(result.files.length, 51);
  });

  test('brief: todo campo no nulo inferido tiene entrada en sources', () => {
    for (const key of ['name', 'type', 'language', 'locale', 'contact.phone', 'contact.email', 'contact.address', 'brand.logo', 'services']) {
      assert.ok(brief.sources[key], `falta sources['${key}']`);
      assert.ok(['high', 'medium', 'low'].includes(brief.sources[key].confidence));
    }
  });

  test('--download-images con source dir copia desde el root y reescribe enlaces', async () => {
    const out2 = tmp();
    const r = await extract(inventory, {
      out: out2,
      inventoryDir: invDir,
      sourceRoot: wpLike,
      downloadImages: true,
    });
    // El fixture solo tiene logo.svg en disco: los jpg de wp-content no existen → avisos, no fallos.
    assert.ok(existsSync(join(out2, 'assets')));
    assert.ok(r.warnings.some((w) => /no existe|no se encontr/i.test(w)));
  });

  test('scan-source registra source.root y extract lo usa sin --source-root', async () => {
    const out4 = tmp();
    assert.equal(inventory.source.root, wpLike);
    const r = await extract(inventory, { out: out4, inventoryDir: invDir, downloadImages: true });
    assert.ok(!r.warnings.some((w) => /--source-root/i.test(w)));
  });

  test('--download-images sin root registrado → aviso y sin copia', async () => {
    const out3 = tmp();
    // scan-source ya registra source.root; simulamos un inventario antiguo sin él.
    const noRoot = { ...inventory, source: { ...inventory.source, root: null } };
    const r = await extract(noRoot, { out: out3, inventoryDir: invDir, downloadImages: true });
    assert.ok(r.warnings.some((w) => /root|raíz/i.test(w)));
  });
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

describe('CLI extract-content.mjs', () => {
  test('--help sale con 0 y muestra uso', () => {
    const r = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /--download-images/);
  });

  test('sin argumentos → exit 1', () => {
    const r = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.equal(r.status, 1);
  });

  test('inventory.json inexistente → exit 1', () => {
    const r = spawnSync(process.execPath, [scriptPath, '/no/existe/inventory.json', '--out', tmp()], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error/);
  });

  test('ejecución real con --json imprime el brief', async () => {
    const invDir = tmp();
    await scan(wpLike, { out: invDir });
    const out = tmp();
    const r = spawnSync(
      process.execPath,
      [scriptPath, join(invDir, 'inventory.json'), '--out', out, '--source-root', wpLike, '--json'],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    const brief = JSON.parse(r.stdout);
    assert.equal(brief.name, 'Taller Demo');
    assert.ok(existsSync(join(out, 'brief.json')));
    assert.ok(existsSync(join(out, 'content', 'pages', 'contacto.md')));
    assert.ok(existsSync(join(out, 'content', 'blog', 'post-30.md')));
  });
});
