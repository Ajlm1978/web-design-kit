/**
 * audit.test.mjs — pruebas de audit-site.mjs sobre el inventario del fixture wp-like.
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * El inventario se construye con scan() (carpeta estática, 42 páginas, sin entradas 404): los enlaces rotos
 * se deducen de los destinos que no existen en el inventario (los 3 enlaces a `/no-existe-N/`).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { scan } from '../scan-source.mjs';
import { audit, findBrokenLinks, parseRobotsForAi, AI_CRAWLERS } from '../audit-site.mjs';
import { auditHtml } from '../../check-seo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixture = resolve(repoRoot, 'evals/fixtures/wp-like');
const scriptPath = resolve(here, '../audit-site.mjs');

const temps = [];
function tmp(prefix = 'wdk-audit-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function run(args, opts = {}) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolveP({ code, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// check-seo.mjs → auditHtml reutilizable
// ---------------------------------------------------------------------------

describe('auditHtml (check-seo.mjs)', () => {
  test('devuelve {errors, warnings, info} con {code, msg} y no ejecuta la CLI al importarse', () => {
    const html = readFileSync(join(fixture, 'contacto', 'index.html'), 'utf8');
    const r = auditHtml(html, { url: 'http://localhost/contacto/', site: 'http://localhost' });
    for (const k of ['errors', 'warnings', 'info']) {
      assert.ok(Array.isArray(r[k]), `${k} debe ser array`);
      for (const f of r[k]) {
        assert.equal(typeof f.code, 'string');
        assert.equal(typeof f.msg, 'string');
      }
    }
    assert.ok(r.info.some((f) => f.code === 'jsonld'), 'detecta el JSON-LD de /contacto/');
    assert.ok(!r.errors.some((f) => f.code === 'canonical-self'), 'la canónica coincide con la URL');
  });

  test('canonical-self usa la ruta derivada de url', () => {
    const html = '<html lang="es"><head><title>Título de prueba</title><link rel="canonical" href="https://s.com/a/"></head><body><h1>A</h1></body></html>';
    const ok = auditHtml(html, { url: 'https://s.com/a/', site: 'https://s.com' });
    assert.ok(!ok.errors.some((f) => f.code === 'canonical-self'));
    const bad = auditHtml(html, { url: 'https://s.com/b/', site: 'https://s.com' });
    assert.ok(bad.errors.some((f) => f.code === 'canonical-self'));
  });
});

// ---------------------------------------------------------------------------
// audit() sobre el inventario de scan(wp-like)
// ---------------------------------------------------------------------------

describe('audit(inventory) — fixture wp-like', () => {
  let inv;
  let out;
  let result;

  before(async () => {
    assert.ok(existsSync(join(fixture, 'index.html')), 'fixture wp-like no encontrado (corre evals/fixtures/generate.mjs)');
    const invDir = tmp();
    inv = await scan(fixture, { out: invDir });
    assert.equal(inv.pages.length, 42);
    out = tmp();
    result = await audit(inv, { inventoryDir: invDir, out, lighthouse: false, fetch: false });
  });

  test('summary: 3 enlaces rotos (no-existe-1/2/3) y 1 duplicado', () => {
    assert.equal(result.summary.pages, 42);
    assert.equal(result.summary.broken, 3);
    const targets = result.brokenLinks.map((b) => b.to).sort();
    assert.deepEqual(targets, ['http://localhost/no-existe-1/', 'http://localhost/no-existe-2/', 'http://localhost/no-existe-3/']);
    for (const b of result.brokenLinks) {
      assert.ok(typeof b.from === 'string' && b.from.startsWith('http://localhost/'));
      assert.ok('status' in b);
    }
    assert.equal(result.summary.duplicates, 1);
    assert.equal(result.duplicates.length, 1);
    assert.deepEqual(result.duplicates[0].urls.sort(), ['http://localhost/duplicada/', 'http://localhost/nosotros/']);
    assert.match(result.duplicates[0].contentHash, /^[0-9a-f]{40}$/);
  });

  test('las rutas dinámicas del CMS (/tag/, /author/) no cuentan como rotas en modo dir', () => {
    assert.ok(!result.brokenLinks.some((b) => /\/(tag|author)\//.test(b.to)));
    assert.ok(result.unresolved.some((u) => /\/tag\//.test(u.to)), 'se listan como no verificables');
  });

  test('audit.json y audit.md se escriben con la forma esperada', () => {
    const jsonPath = join(out, 'audit.json');
    const mdPath = join(out, 'audit.md');
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    for (const k of ['pages', 'errors', 'warnings', 'broken', 'duplicates', 'heavyImages', 'jsOnly']) {
      assert.equal(typeof json.summary[k], 'number', `summary.${k}`);
    }
    assert.equal(json.pages.length, 42);
    for (const p of json.pages) {
      assert.equal(typeof p.url, 'string');
      assert.ok(Array.isArray(p.errors));
      assert.ok(Array.isArray(p.warnings));
    }
    assert.ok(Array.isArray(json.brokenLinks));
    assert.ok(Array.isArray(json.duplicates));
    assert.ok(Array.isArray(json.heavyImages));
    assert.ok(json.stack && typeof json.stack === 'object');
    assert.ok(Array.isArray(json.aiCrawlers.allowed));
    assert.ok(Array.isArray(json.aiCrawlers.blocked));
    assert.ok(!('lighthouse' in json) || json.lighthouse === undefined, 'sin --lighthouse no hay clave lighthouse');

    const md = readFileSync(mdPath, 'utf8');
    const headings = [
      '## Resumen ejecutivo',
      '## Páginas con errores',
      '## Enlaces rotos',
      '## Imágenes',
      '## Seguridad y rastreo',
      '## Contenido duplicado',
      '## Stack y riesgos',
      '## Qué cambia con la migración',
    ];
    let last = -1;
    for (const h of headings) {
      const idx = md.indexOf(`\n${h}\n`);
      assert.ok(idx !== -1, `falta la sección ${h}`);
      assert.ok(idx > last, `sección fuera de orden: ${h}`);
      last = idx;
    }
    assert.ok(!md.includes('## Lighthouse (móvil)'), 'sin --lighthouse no hay sección Lighthouse');
    assert.ok(md.includes('/no-existe-1/'));
    assert.ok(md.includes('/duplicada/'));
    assert.match(md, /robots\.txt[^\n]*no disponible/i);
  });

  test('páginas sin <main> (galeria, legal) no son errores', () => {
    for (const path of ['/galeria/', '/legal/']) {
      const p = result.pages.find((x) => x.url === `http://localhost${path}`);
      assert.ok(p, `falta ${path}`);
      assert.ok(!p.errors.some((f) => f.code === 'main'));
      assert.ok(!p.warnings.some((f) => f.code === 'main'));
    }
  });

  test('/privado/ con noindex se marca como info, no como error', () => {
    const p = result.pages.find((x) => x.url === 'http://localhost/privado/');
    assert.ok(p);
    assert.ok(p.info.some((f) => f.code === 'noindex'));
    assert.ok(!p.errors.some((f) => f.code === 'noindex'));
    assert.ok(!p.warnings.some((f) => f.code === 'noindex'));
  });

  test('summary.errors/warnings coinciden con la suma por página', () => {
    const e = result.pages.reduce((n, p) => n + p.errors.length, 0);
    const w = result.pages.reduce((n, p) => n + p.warnings.length, 0);
    assert.equal(result.summary.errors, e);
    assert.equal(result.summary.warnings, w);
    assert.ok(result.summary.errors > 0, 'el fixture tiene errores SEO (og/twitter ausentes)');
  });
});

// ---------------------------------------------------------------------------
// findBrokenLinks: modo url (status ≥ 400) y modo dir (ausente del inventario)
// ---------------------------------------------------------------------------

describe('findBrokenLinks', () => {
  const page = (url, status, links = []) => ({ url, status, finalUrl: url, links });

  test('kind=url: roto si el destino es una Page con status ≥ 400; lo no rastreado no cuenta', () => {
    const inv = {
      source: { kind: 'url', origin: 'https://s.com' },
      pages: [page('https://s.com/', 200, ['https://s.com/a/', 'https://s.com/404/', 'https://s.com/nunca/']), page('https://s.com/a/', 200), page('https://s.com/404/', 404)],
      skipped: [],
    };
    const { broken, unresolved } = findBrokenLinks(inv);
    assert.deepEqual(broken, [{ from: 'https://s.com/', to: 'https://s.com/404/', status: 404 }]);
    assert.deepEqual(unresolved.map((u) => u.to), ['https://s.com/nunca/']);
  });

  test('kind=url: un redirect en skipped es resoluble; un error de red cuenta como roto', () => {
    const inv = {
      source: { kind: 'url', origin: 'https://s.com' },
      pages: [page('https://s.com/', 200, ['https://s.com/r/', 'https://s.com/e/'])],
      skipped: [
        { url: 'https://s.com/r/', reason: 'redirect', status: 301, finalUrl: 'https://s.com/' },
        { url: 'https://s.com/e/', reason: 'error' },
      ],
    };
    const { broken } = findBrokenLinks(inv);
    assert.deepEqual(broken.map((b) => b.to), ['https://s.com/e/']);
    assert.equal(broken[0].status, null);
  });

  test('kind=dir: roto si el destino no existe en pages ni skipped', () => {
    const inv = {
      source: { kind: 'dir', origin: 'http://localhost' },
      pages: [page('http://localhost/', 200, ['http://localhost/a/', 'http://localhost/x/', 'http://localhost/tag/t/'])],
      skipped: [{ url: 'http://localhost/a/', reason: 'redirect' }],
    };
    const { broken, unresolved } = findBrokenLinks(inv);
    assert.deepEqual(broken, [{ from: 'http://localhost/', to: 'http://localhost/x/', status: null }]);
    assert.deepEqual(unresolved.map((u) => u.to), ['http://localhost/tag/t/']);
  });
});

// ---------------------------------------------------------------------------
// robots.txt → rastreadores de IA
// ---------------------------------------------------------------------------

describe('parseRobotsForAi', () => {
  test('bloqueo por grupo específico y por *', () => {
    const txt = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado/\n';
    const r = parseRobotsForAi(txt);
    assert.ok(r.blocked.includes('GPTBot'));
    assert.ok(r.allowed.includes('ClaudeBot'));
    assert.equal(r.allowed.length + r.blocked.length, AI_CRAWLERS.length);
  });

  test('Disallow: / en * bloquea a todos', () => {
    const r = parseRobotsForAi('User-agent: *\nDisallow: /\n');
    assert.equal(r.allowed.length, 0);
    assert.equal(r.blocked.length, AI_CRAWLERS.length);
  });
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

describe('CLI audit-site.mjs', () => {
  test('--help sale con 0 y muestra el uso', async () => {
    const r = await run(['--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /audit-site\.mjs <inventory\.json> --out <dir>/);
    assert.match(r.stdout, /--lighthouse/);
  });

  test('sin argumentos sale con 1', async () => {
    const r = await run([]);
    assert.equal(r.code, 1);
  });

  test('inventario inexistente sale con 1', async () => {
    const r = await run([join(tmp(), 'nope.json'), '--out', tmp()]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Error/);
  });

  test('--json imprime el audit.json y escribe audit.md', async () => {
    const invDir = tmp();
    await scan(fixture, { out: invDir });
    const out = tmp();
    const r = await run([join(invDir, 'inventory.json'), '--out', out, '--json']);
    assert.equal(r.code, 0, r.stderr);
    const json = JSON.parse(r.stdout);
    assert.equal(json.summary.broken, 3);
    assert.equal(json.summary.duplicates, 1);
    assert.ok(existsSync(join(out, 'audit.md')));
  });

  test('--lighthouse sobre un inventario de carpeta escribe "no ejecutado"', async () => {
    const invDir = tmp();
    await scan(fixture, { out: invDir });
    const out = tmp();
    const r = await run([join(invDir, 'inventory.json'), '--out', out, '--lighthouse']);
    assert.equal(r.code, 0, r.stderr);
    const md = readFileSync(join(out, 'audit.md'), 'utf8');
    assert.ok(md.includes('## Lighthouse (móvil)'));
    assert.match(md, /no ejecutado:/);
    const json = JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8'));
    assert.ok(Array.isArray(json.lighthouse));
  });

  test('inventario con raw/robots.txt: se analiza y se listan rastreadores de IA', async () => {
    const invDir = tmp();
    const inv = await scan(fixture, { out: invDir });
    mkdirSync(join(invDir, 'raw'), { recursive: true });
    writeFileSync(join(invDir, 'raw', 'robots.txt'), 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado/\nSitemap: http://localhost/sitemap.xml\n');
    const out = tmp();
    const result = await audit(inv, { inventoryDir: invDir, out, fetch: false });
    assert.ok(result.aiCrawlers.blocked.includes('GPTBot'));
    assert.ok(result.aiCrawlers.allowed.includes('ClaudeBot'));
    const md = readFileSync(join(out, 'audit.md'), 'utf8');
    assert.ok(md.includes('GPTBot'));
  });
});
