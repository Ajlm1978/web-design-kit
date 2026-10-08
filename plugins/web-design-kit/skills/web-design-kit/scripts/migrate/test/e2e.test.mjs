/**
 * e2e.test.mjs — la costura completa de /migrate-site sobre el fixture wp-like servido por HTTP:
 *
 *   crawl → audit → extract → copiar content/blog/*.md a src/content/blog/ (sin renombrar) → dist/ simulado
 *   (una carpeta <ruta>/index.html por targetPath, como lo haría Astro) → planRedirects → checkRedirects.
 *
 * Es el test que faltaba en el informe QA (H-01): antes de la corrección los posts se escribían como
 * `blog-post-NN.md`, Astro los servía en /blog/blog-post-NN/ y check-redirects daba 30 huérfanas. Aquí el
 * dist se deriva del nombre de archivo copiado, así que un renombrado involuntario vuelve a fallar.
 *
 * No ejecuta Astro (para que corra en < 2 s); el build real lo cubre ./init.sh sobre la plantilla.
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * Requiere evals/fixtures/wp-like (generado por evals/fixtures/generate.mjs).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { crawl } from '../crawl-site.mjs';
import { audit } from '../audit-site.mjs';
import { extract } from '../extract-content.mjs';
import { validateBrief } from '../lib/brief.mjs';
import { planRedirects, checkRedirects, mergeVercelRedirects, pathOf, REASON_SLUG, REASON_PARENT } from '../lib/redirects.mjs';
import { loadRedirects } from '../check-redirects.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixture = resolve(repoRoot, 'evals/fixtures/wp-like');
const templateBlog = resolve(repoRoot, 'plugins/web-design-kit/templates/astro-marketing/src/content/blog');

const MIME = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml' };

/** Servidor estático mínimo (como `python3 -m http.server`): 200 para lo que existe, 404 para el resto. */
function serveStatic(root) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.endsWith('/') ? join(root, path, 'index.html') : join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><html><head><title>404</title></head><body><h1>No encontrada</h1></body></html>');
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolveP) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveP({ origin: `http://localhost:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function parseFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  assert.ok(m, 'frontmatter YAML');
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*): (.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v === 'null') v = null;
    else if (/^".*"$/.test(v)) v = JSON.parse(v);
    data[kv[1]] = v;
  }
  return { data, body: md.slice(m[0].length) };
}

/** Crea `<dist>/<ruta>/index.html` por cada ruta (lo que Astro genera con trailingSlash). */
function makeDist(dist, paths) {
  for (const p of paths) {
    const dir = join(dist, ...p.split('/').filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${p}</title>`, 'utf8');
  }
}

describe('E2E wp-like: crawl → audit → extract → copiar posts → dist simulado → plan/check-redirects', () => {
  const temps = [];
  const tmp = (p) => {
    const d = mkdtempSync(join(tmpdir(), p));
    temps.push(d);
    return d;
  };
  let site;
  let migration;
  let inventory;
  let auditResult;
  let extracted;
  let brief;
  let siteDir;
  let dist;
  let mapping;
  let plan;
  let report;

  /** mapping.json como lo escribiría el agente con el cliente: solo lo que cambia o se descarta. */
  const archivePaths = () => brief.pages.filter((p) => /^\/(tag|author)\//.test(p.path)).map((p) => p.path);

  before(async () => {
    assert.ok(existsSync(join(fixture, 'index.html')), 'fixture wp-like no encontrado (corre evals/fixtures/generate.mjs)');
    site = await serveStatic(fixture);
    migration = tmp('wdk-e2e-migration-');

    // Fase 1–3
    inventory = await crawl(`${site.origin}/`, { out: migration, delayMs: 0, quiet: true });
    auditResult = await audit(inventory, { inventoryDir: migration, out: migration, fetch: false });
    extracted = await extract(inventory, { out: migration, inventoryDir: migration });
    brief = JSON.parse(readFileSync(join(migration, 'brief.json'), 'utf8'));

    // Fase 4: proyecto nuevo (solo lo que toca la migración; sin Astro)
    siteDir = tmp('wdk-e2e-site-');
    cpSync(templateBlog, join(siteDir, 'src/content/blog'), { recursive: true });
    for (const f of readdirSync(join(migration, 'content', 'blog'))) {
      if (f.endsWith('.md')) cpSync(join(migration, 'content', 'blog', f), join(siteDir, 'src/content/blog', f)); // sin renombrar
    }
    mapping = { '/faq/': '/preguntas/', '/duplicada/': null };
    for (const p of archivePaths()) mapping[p] = { to: '/blog/', reason: 'archivo de etiquetas/autor: no se reconstruye' };

    // dist/ simulado: las páginas que se conservan + las nuevas + los posts tal y como los serviría Astro
    // (slug = nombre del archivo copiado a src/content/blog/).
    dist = join(siteDir, 'dist');
    const keptPages = brief.pages.filter((p) => p.type === 'page' && !(p.path in mapping)).map((p) => p.targetPath);
    const newPages = Object.values(mapping).filter((v) => typeof v === 'string');
    const postPaths = readdirSync(join(siteDir, 'src/content/blog'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `/blog/${basename(f, '.md')}/`);
    makeDist(dist, [...keptPages, ...newPages, ...postPaths]);

    // Fase 5
    plan = planRedirects(inventory, mapping, { pages: brief.pages });
    report = checkRedirects(inventory, dist, plan.redirects);
  });

  after(async () => {
    await site.close();
    for (const d of temps) rmSync(d, { recursive: true, force: true });
  });

  test('inventario por URL: 50 páginas 200 + 3 URL 404, /privado/ omitida por robots', () => {
    assert.equal(inventory.pages.filter((p) => p.status === 200).length, 50);
    assert.equal(inventory.pages.filter((p) => p.status === 404).length, 3);
    assert.equal(inventory.skipped.filter((s) => s.reason === 'robots').length, 1);
  });

  test('auditoría: 50 páginas auditadas, 3 enlaces rotos hacia 3 destinos, 1 duplicado (cifras coherentes, H-05)', () => {
    const s = auditResult.summary;
    assert.equal(s.pages, 50);
    assert.equal(s.inventoried, 53);
    assert.equal(s.errorPages, 3);
    assert.equal(s.broken, 3);
    assert.equal(s.brokenTargets, 3);
    assert.equal(s.duplicates, 1);
    assert.equal(auditResult.pages.length, 50);
    const md = readFileSync(join(migration, 'audit.md'), 'utf8');
    assert.match(md, /Se revisaron \*\*50 páginas\*\*/);
    assert.match(md, /\*\*3 enlaces rotos\*\* dentro del sitio hacia \*\*3\*\* destinos/);
  });

  test('extracción: 30 posts en content/blog/post-NN.md, 20 páginas en content/pages/, brief válido', () => {
    const blog = readdirSync(join(migration, 'content', 'blog')).filter((f) => f.endsWith('.md')).sort();
    const pages = readdirSync(join(migration, 'content', 'pages')).filter((f) => f.endsWith('.md'));
    assert.equal(blog.length, 30);
    assert.equal(blog[0], 'post-01.md');
    assert.equal(blog[29], 'post-30.md');
    assert.equal(pages.length, 20); // 12 páginas − /privado/ (robots) + 9 archivos tag/author
    assert.equal(extracted.files.length, 50);
    assert.equal(validateBrief(brief).ok, true);
    assert.equal(brief.name, 'Taller Demo');
    assert.equal(brief.migration.posts, 30);
    assert.ok(Object.values(brief.sources).filter((s) => s.confidence === 'high').length >= 5);
  });

  test('posts copiados: frontmatter compatible con la colección y cuerpo limpio (H-02, H-06, H-07)', () => {
    const files = readdirSync(join(siteDir, 'src/content/blog')).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, 30);
    for (const f of files) {
      const { data, body } = parseFrontmatter(readFileSync(join(siteDir, 'src/content/blog', f), 'utf8'));
      assert.equal(data.type, 'post', f);
      assert.ok(typeof data.title === 'string' && data.title.length > 0, `${f}: title`);
      assert.ok(!/ - Taller Demo$/.test(data.title), `${f}: título sin sufijo del sitio`);
      assert.ok(data.date && /^2024-/.test(data.date), `${f}: fecha original`);
      assert.equal(data.path, `/blog/${basename(f, '.md')}/`);
      assert.ok(!/^# /m.test(body), `${f}: sin H1 en el cuerpo`);
      assert.ok(!/^Publicado el /m.test(body) && !/^Etiquetas:/m.test(body), `${f}: sin meta de WP en el cuerpo`);
      assert.ok(!/(^|[^!])\[[^\]]*\]\(http:\/\/localhost/.test(body), `${f}: enlaces relativos a la raíz`);
    }
  });

  test('plan: solo los cambios en mapping.json → 2 + 9 redirects, 0 sin mapping, 0 conflictos (H-03)', () => {
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.redirects.length, 2 + archivePaths().length);
    assert.deepEqual(plan.redirects.find((r) => r.from === '/faq/'), { from: '/faq/', to: '/preguntas/', status: 301, reason: REASON_SLUG });
    assert.deepEqual(plan.redirects.find((r) => r.from === '/duplicada/'), { from: '/duplicada/', to: '/', status: 301, reason: REASON_PARENT });
    assert.ok(plan.unchanged.includes('/'), 'la home no está en el mapping y no cambia');
    for (let i = 1; i <= 30; i++) assert.ok(plan.unchanged.includes(`/blog/post-${String(i).padStart(2, '0')}/`));
  });

  test('paridad (gate bloqueante): 0 huérfanas, 0 bucles, 0 conflictos; los 30 posts resuelven sin redirect (H-01)', () => {
    assert.deepEqual(report.orphans, [], JSON.stringify(report.orphans, null, 2));
    assert.equal(report.loops.length, 0);
    assert.equal(report.conflicts.length, 0);
    assert.equal(report.ok, true);
    assert.equal(report.checked, 50);
    assert.equal(report.redirected, 2 + archivePaths().length);
    for (const p of inventory.pages.filter((x) => x.status === 200 && /\/blog\/post-\d+\/$/.test(x.url))) {
      const path = pathOf(p.url);
      assert.ok(!plan.redirects.some((r) => r.from === path), `${path} no necesita redirect`);
      assert.ok(existsSync(join(dist, ...path.split('/').filter(Boolean), 'index.html')), `${path} existe en dist`);
    }
  });

  test('H-04: el mismo plan pasado por vercel.json (sin reason) no da falso conflicto', () => {
    const vercelFile = join(siteDir, 'vercel.json');
    writeFileSync(vercelFile, JSON.stringify(mergeVercelRedirects({ trailingSlash: true, headers: [] }, plan.redirects)), 'utf8');
    const loaded = loadRedirects(vercelFile);
    assert.equal(loaded.format, 'vercel');
    assert.equal(loaded.hasReasons, false);
    const r = checkRedirects(inventory, dist, loaded.list, { conflicts: loaded.hasReasons });
    assert.equal(r.ok, true);
    assert.equal(r.conflictsChecked, false);
    assert.equal(r.orphans.length, 0);
  });

  test('regresión H-01: si los posts se renombraran como antes (blog-post-NN), la paridad fallaría con 30 huérfanas', () => {
    const badDist = tmp('wdk-e2e-baddist-');
    const keptPages = brief.pages.filter((p) => p.type === 'page' && !(p.path in mapping)).map((p) => p.targetPath);
    const renamed = readdirSync(join(siteDir, 'src/content/blog'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `/blog/blog-${basename(f, '.md')}/`);
    makeDist(badDist, [...keptPages, '/preguntas/', '/blog/', ...renamed]);
    const bad = checkRedirects(inventory, badDist, plan.redirects);
    assert.equal(bad.ok, false);
    assert.equal(bad.orphans.length, 30);
  });
});
