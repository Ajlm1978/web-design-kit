/**
 * scan.test.mjs — pruebas de scan-source.mjs (inventario desde carpeta, WXR o repo).
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * Requiere evals/fixtures/wp-like (generado por evals/fixtures/generate.mjs) y evals/fixtures/wp-export.xml.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { scan, detectStack } from '../scan-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixtures = resolve(repoRoot, 'evals/fixtures');
const scriptPath = resolve(here, '../scan-source.mjs');

const temps = [];
function tmp(prefix = 'wdk-scan-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function assertInventoryShape(inv, kind) {
  assert.equal(inv.version, 1);
  assert.equal(inv.source.kind, kind);
  assert.ok(typeof inv.source.origin === 'string');
  assert.ok(typeof inv.source.stack === 'string');
  assert.ok(!Number.isNaN(Date.parse(inv.source.detectedAt)));
  assert.ok(Array.isArray(inv.pages));
  assert.ok(Array.isArray(inv.skipped));
  assert.ok(Array.isArray(inv.warnings));
  assert.equal(typeof inv.stats.fetched, 'number');
  assert.equal(typeof inv.stats.errors, 'number');
  assert.equal(typeof inv.stats.durationMs, 'number');
}

// ---------------------------------------------------------------------------
// Carpeta estática (wp-like)
// ---------------------------------------------------------------------------

describe('scan(dir) — HTML estático', () => {
  const fixture = resolve(fixtures, 'wp-like');
  assert.ok(existsSync(fixture), `fixture no encontrado: ${fixture} (corre evals/fixtures/generate.mjs)`);

  test('detecta stack static, 42 páginas y JSON-LD de /contacto/', async () => {
    const out = tmp();
    const inv = await scan(fixture, { out });
    assertInventoryShape(inv, 'dir');
    assert.equal(inv.source.stack, 'static');
    assert.equal(inv.pages.length, 42);
    assert.equal(inv.stats.fetched, 42);

    const contacto = inv.pages.find((p) => p.url === 'http://localhost/contacto/');
    assert.ok(contacto, 'falta la página /contacto/');
    assert.equal(contacto.jsonld[0]['@type'], 'LocalBusiness');
    assert.equal(contacto.status, 200);
    assert.equal(contacto.finalUrl, contacto.url);
    assert.equal(contacto.rendered, false);
    assert.ok(contacto.title && contacto.title.includes('Contacto'));
    assert.ok(contacto.wordCount > 0);
    assert.ok(contacto.links.length > 0);
    assert.ok(contacto.links.every((l) => l.startsWith('http://localhost/')));
    assert.match(contacto.contentHash, /^[0-9a-f]{40}$/);

    // raw/<sha1(url)>.html copiado
    assert.ok(contacto.rawFile.startsWith('raw/'));
    assert.ok(existsSync(join(out, contacto.rawFile)));
    assert.equal(readdirSync(join(out, 'raw')).length, 42);

    // inventory.json escrito en disco y equivalente
    const onDisk = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
    assert.equal(onDisk.pages.length, 42);
    assert.equal(onDisk.source.stack, 'static');
  });

  test('--base-url cambia el origen de las URLs', async () => {
    const out = tmp();
    const inv = await scan(fixture, { out, baseUrl: 'https://old.example.com' });
    assert.ok(inv.pages.every((p) => p.url.startsWith('https://old.example.com/')));
    assert.ok(inv.pages.some((p) => p.url === 'https://old.example.com/'));
    assert.ok(inv.pages.some((p) => p.url === 'https://old.example.com/blog/'));
  });
});

// ---------------------------------------------------------------------------
// WXR (export de WordPress)
// ---------------------------------------------------------------------------

describe('scan(file.xml) — WXR', () => {
  const fixture = resolve(fixtures, 'wp-export.xml');
  assert.ok(existsSync(fixture), `fixture no encontrado: ${fixture}`);

  test('3 posts publicados, 2 descartados por draft/private', async () => {
    const out = tmp();
    const inv = await scan(fixture, { out });
    assertInventoryShape(inv, 'dir');
    assert.equal(inv.source.stack, 'wxr');
    assert.equal(inv.source.origin, 'https://taller-demo.example');
    assert.equal(inv.pages.length, 3);
    for (const p of inv.pages) {
      assert.equal(p.type, 'post');
      assert.match(p.date, /^2024-\d{2}-\d{2}/);
      assert.equal(p.author, 'ana');
      assert.ok(Array.isArray(p.tags) && p.tags.includes('Mantenimiento'));
      assert.equal(p.status, 200);
      assert.ok(p.url.startsWith('https://taller-demo.example/blog/'));
      assert.ok(p.wordCount > 0);
      assert.ok(existsSync(join(out, p.rawFile)));
    }
    const primero = inv.pages.find((p) => p.url.endsWith('/primer-articulo/'));
    assert.equal(primero.title, 'Primer artículo publicado');
    assert.ok(primero.h1 === null || typeof primero.h1 === 'string');
    assert.ok(primero.images.length >= 1);
    assert.ok(primero.links.includes('https://taller-demo.example/servicios/'));
    const raw = readFileSync(join(out, primero.rawFile), 'utf8');
    assert.ok(raw.includes('<article'), 'el raw debe envolverse en <article>');
    assert.ok(raw.includes('Introducción'));

    assert.equal(inv.skipped.length, 2);
    const reasons = inv.skipped.map((s) => s.reason).sort();
    assert.deepEqual(reasons, ['draft', 'private']);
    assert.ok(inv.skipped.every((s) => s.url.startsWith('https://taller-demo.example/')));
  });
});

// ---------------------------------------------------------------------------
// Seguridad: credenciales nunca se leen ni copian
// ---------------------------------------------------------------------------

describe('scan(dir) — credenciales', () => {
  test('ignora .env con warning y no lo copia a raw/', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="es"><head><title>Hola</title></head><body><main><h1>Hola</h1><p>Texto de prueba.</p></main></body></html>');
    writeFileSync(join(dir, '.env'), 'SECRET=nunca\n');
    const out = tmp();
    const inv = await scan(dir, { out });
    assert.equal(inv.source.stack, 'static');
    assert.equal(inv.pages.length, 1);
    assert.equal(readdirSync(join(out, 'raw')).length, 1);
    assert.ok(inv.warnings.length >= 1);
    assert.ok(inv.warnings[0].includes('.env'), inv.warnings[0]);
    assert.ok(inv.warnings[0].includes('credencial'));
    const rawText = readFileSync(join(out, inv.pages[0].rawFile), 'utf8');
    assert.ok(!rawText.includes('SECRET=nunca'));
  });
});

// ---------------------------------------------------------------------------
// Frameworks: rutas por convención
// ---------------------------------------------------------------------------

describe('scan(dir) — frameworks', () => {
  test('astro: rutas desde src/pages', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'astro.config.mjs'), 'export default {};\n');
    mkdirSync(join(dir, 'src/pages'), { recursive: true });
    writeFileSync(join(dir, 'src/pages/a.astro'), '---\n---\n<h1>A</h1>');
    const out = tmp();
    const inv = await scan(dir, { out });
    assert.equal(inv.source.stack, 'astro');
    assert.equal(inv.pages.length, 1);
    assert.equal(inv.pages[0].url, 'http://localhost/a/');
    assert.equal(inv.pages[0].rawFile, null);
    assert.equal(inv.pages[0].status, null);
  });

  test('detectStack reconoce next, hugo, jekyll, wordpress, spa y unknown', () => {
    const next = tmp();
    writeFileSync(join(next, 'next.config.js'), '');
    assert.equal(detectStack(next), 'next');

    const hugo = tmp();
    writeFileSync(join(hugo, 'hugo.toml'), '');
    mkdirSync(join(hugo, 'content'));
    assert.equal(detectStack(hugo), 'hugo');

    const jekyll = tmp();
    writeFileSync(join(jekyll, '_config.yml'), '');
    mkdirSync(join(jekyll, '_posts'));
    assert.equal(detectStack(jekyll), 'jekyll');

    const wp = tmp();
    mkdirSync(join(wp, 'wp-content'));
    assert.equal(detectStack(wp), 'wordpress');

    const spa = tmp();
    writeFileSync(join(spa, 'index.html'), '<div id="root"></div>');
    mkdirSync(join(spa, 'src'));
    writeFileSync(join(spa, 'src/main.tsx'), '');
    assert.equal(detectStack(spa), 'spa');

    const empty = tmp();
    assert.equal(detectStack(empty), 'unknown');
  });
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

describe('CLI', () => {
  test('--help sale 0 y describe el uso', () => {
    const r = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /scan-source/);
    assert.match(r.stdout, /--out/);
  });

  test('--json imprime el inventario en stdout', () => {
    const out = tmp();
    const r = spawnSync(process.execPath, [scriptPath, resolve(fixtures, 'wp-export.xml'), '--out', out, '--json'], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const inv = JSON.parse(r.stdout);
    assert.equal(inv.source.stack, 'wxr');
    assert.equal(inv.pages.length, 3);
  });

  test('ruta inexistente → exit 1', () => {
    const out = tmp();
    const r = spawnSync(process.execPath, [scriptPath, join(out, 'no-existe'), '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no existe|No existe/);
  });
});
