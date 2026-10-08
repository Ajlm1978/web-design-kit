/**
 * redirects.test.mjs — pruebas de lib/redirects.mjs, plan-redirects.mjs y check-redirects.mjs.
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 * Requiere evals/fixtures/wp-like (generado por evals/fixtures/generate.mjs).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { scan } from '../scan-source.mjs';
import {
  planRedirects,
  checkRedirects,
  resolveChain,
  mergeVercelRedirects,
  toCloudflareRedirects,
  pathOf,
  REASON_SLUG,
  REASON_PARENT,
} from '../lib/redirects.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixture = resolve(repoRoot, 'evals/fixtures/wp-like');
const planScript = resolve(here, '../plan-redirects.mjs');
const checkScript = resolve(here, '../check-redirects.mjs');

const temps = [];
function tmp(prefix = 'wdk-redirects-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function run(script, args, opts = {}) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [script, ...args], { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolveP({ code, stdout, stderr }));
  });
}

/** Las 12 páginas del fixture (sin posts). */
const PAGES = [
  '/',
  '/blog/',
  '/contacto/',
  '/duplicada/',
  '/equipo/',
  '/faq/',
  '/galeria/',
  '/legal/',
  '/nosotros/',
  '/precios/',
  '/privado/',
  '/servicios/',
];

/** Mapping identidad: cada página se conserva; los posts quedan por defecto. */
function identityMapping() {
  const m = {};
  for (const p of PAGES) m[p] = p;
  return m;
}

/** Crea `<dist>/<path>/index.html` para cada ruta. */
function makeDist(paths) {
  const dist = tmp('wdk-dist-');
  for (const p of paths) {
    const dir = join(dist, ...p.split('/').filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${p}</title>`, 'utf8');
  }
  return dist;
}

function writeJson(dir, name, obj) {
  const file = join(dir, name);
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  return file;
}

let inventory;
let inventoryFile;
const allPaths = () => inventory.pages.filter((p) => p.status < 400).map((p) => pathOf(p.url));

before(async () => {
  assert.ok(existsSync(fixture), `fixture no encontrado: ${fixture} (corre evals/fixtures/generate.mjs)`);
  const out = tmp('wdk-inv-');
  inventory = await scan(fixture, { out });
  inventoryFile = join(out, 'inventory.json');
  assert.equal(inventory.pages.length, 42);
});

// ---------------------------------------------------------------------------
// planRedirects
// ---------------------------------------------------------------------------

describe('planRedirects', () => {
  test('(a) caso feliz: mapping identidad + posts por defecto → 0 redirects, 42 sin cambios', () => {
    const plan = planRedirects(inventory, identityMapping());
    assert.equal(plan.redirects.length, 0);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.unchanged.length, 42);
    assert.ok(plan.unchanged.includes('/blog/post-01/'));
  });

  test('(b) slug cambiado → 301; página descartada → 301 al padre más cercano del mapping', () => {
    const mapping = { ...identityMapping(), '/faq/': '/preguntas/', '/equipo/': null };
    const plan = planRedirects(inventory, mapping);
    assert.equal(plan.redirects.length, 2);
    assert.equal(plan.conflicts.length, 0);
    const faq = plan.redirects.find((r) => r.from === '/faq/');
    assert.deepEqual(faq, { from: '/faq/', to: '/preguntas/', status: 301, reason: REASON_SLUG });
    const equipo = plan.redirects.find((r) => r.from === '/equipo/');
    // /equipo/ no está anidado: su padre más cercano es `/`.
    assert.deepEqual(equipo, { from: '/equipo/', to: '/', status: 301, reason: REASON_PARENT });
  });

  test('página descartada anidada → padre existente en los valores del mapping', () => {
    const inv = {
      ...inventory,
      pages: [
        ...inventory.pages,
        { url: 'http://localhost/nosotros/equipo/', status: 200 },
        { url: 'http://localhost/nosotros/equipo/juan/', status: 200 },
      ],
    };
    const mapping = { ...identityMapping(), '/nosotros/equipo/': null, '/nosotros/equipo/juan/': null };
    const plan = planRedirects(inv, mapping);
    const juan = plan.redirects.find((r) => r.from === '/nosotros/equipo/juan/');
    assert.equal(juan.to, '/nosotros/'); // /nosotros/equipo/ también fue descartada → salta al abuelo
    assert.equal(plan.conflicts.length, 0); // dos descartadas al mismo padre no son conflicto
  });

  test('(c) dos orígenes → mismo destino sin reason = conflicto; con reason explícito no', () => {
    const bad = { ...identityMapping(), '/precios/': '/servicios/', '/galeria/': '/servicios/' };
    const plan = planRedirects(inventory, bad);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].to, '/servicios/');
    assert.deepEqual(plan.conflicts[0].froms.sort(), ['/galeria/', '/precios/']);

    const good = {
      ...identityMapping(),
      '/precios/': { to: '/servicios/', reason: 'fusionadas' },
      '/galeria/': { to: '/servicios/', reason: 'fusionadas' },
    };
    const plan2 = planRedirects(inventory, good);
    assert.equal(plan2.conflicts.length, 0);
    assert.equal(plan2.redirects.length, 2);
    assert.equal(plan2.redirects[0].reason, 'fusionadas');
  });

  test('página ausente del mapping y no conservada → missing; con keep → unchanged', () => {
    const mapping = identityMapping();
    delete mapping['/legal/'];
    const plan = planRedirects(inventory, mapping);
    assert.deepEqual(plan.missing, ['/legal/']);
    const plan2 = planRedirects(inventory, mapping, { keep: ['/legal/'] });
    assert.equal(plan2.missing.length, 0);
    assert.ok(plan2.unchanged.includes('/legal/'));
  });

  test('status 410 explícito: {to:null, status:410} se registra sin destino', () => {
    const mapping = { ...identityMapping(), '/privado/': { to: null, status: 410, reason: 'eliminada' } };
    const plan = planRedirects(inventory, mapping);
    const r = plan.redirects.find((x) => x.from === '/privado/');
    assert.equal(r.status, 410);
    assert.equal(r.to, null);
  });

  test('normaliza rutas sin barra final o como URL absoluta', () => {
    const mapping = { ...identityMapping(), '/faq': 'https://nuevo.com/preguntas' };
    delete mapping['/faq/'];
    const plan = planRedirects(inventory, mapping);
    const faq = plan.redirects.find((r) => r.from === '/faq/');
    assert.equal(faq.to, '/preguntas/');
  });
});

// ---------------------------------------------------------------------------
// checkRedirects
// ---------------------------------------------------------------------------

describe('checkRedirects', () => {
  test('(a) caso feliz: dist completo y sin redirects → ok, 0 huérfanas', () => {
    const dist = makeDist(allPaths());
    const r = checkRedirects(inventory, dist, []);
    assert.equal(r.ok, true);
    assert.equal(r.orphans.length, 0);
    assert.equal(r.loops.length, 0);
    assert.equal(r.conflicts.length, 0);
    assert.equal(r.checked, 42);
  });

  test('(b) /faq/ → /preguntas/ y /equipo/ → / : dist sin /faq/ ni /equipo/ → 0 huérfanas', () => {
    const plan = planRedirects(inventory, { ...identityMapping(), '/faq/': '/preguntas/', '/equipo/': null });
    const dist = makeDist([...allPaths().filter((p) => p !== '/faq/' && p !== '/equipo/'), '/preguntas/']);
    const r = checkRedirects(inventory, dist, plan.redirects);
    assert.equal(r.ok, true, JSON.stringify(r.orphans));
    assert.equal(r.orphans.length, 0);
    assert.equal(r.redirected, 2);
  });

  test('(d) página sin archivo en dist y sin redirect → 1 huérfana', () => {
    const dist = makeDist(allPaths().filter((p) => p !== '/galeria/'));
    const r = checkRedirects(inventory, dist, []);
    assert.equal(r.ok, false);
    assert.deepEqual(r.orphans, [{ from: '/galeria/', resolvedTo: '/galeria/', hops: 0 }]);
  });

  test('(e) bucle A→B→A → loops.length===1', () => {
    const dist = makeDist(allPaths());
    const redirects = [
      { from: '/faq/', to: '/precios/', status: 301, reason: 'x' },
      { from: '/precios/', to: '/faq/', status: 301, reason: 'y' },
    ];
    const r = checkRedirects(inventory, dist, redirects);
    assert.equal(r.ok, false);
    assert.equal(r.loops.length, 2); // ambas URLs antiguas entran en el bucle
    assert.ok(r.loops.every((l) => l.chain.length >= 2));
    assert.equal(resolveChain('/faq/', redirects).loop, true);
  });

  test('cadena > 5 saltos se reporta como bucle/cadena excesiva', () => {
    const redirects = [];
    for (let i = 0; i < 7; i++) redirects.push({ from: `/c${i}/`, to: `/c${i + 1}/`, status: 301, reason: 'r' });
    const res = resolveChain('/c0/', redirects, 5);
    assert.equal(res.loop, true);
  });

  test('(c) dos orígenes al mismo destino final sin reason explícito → conflicto', () => {
    const dist = makeDist(allPaths());
    const redirects = [
      { from: '/precios/', to: '/servicios/', status: 301, reason: REASON_SLUG },
      { from: '/galeria/', to: '/servicios/', status: 301, reason: REASON_SLUG },
    ];
    const r = checkRedirects(inventory, dist, redirects);
    assert.equal(r.ok, false);
    assert.equal(r.conflicts.length, 1);
    assert.equal(r.conflicts[0].to, '/servicios/');

    const withReason = redirects.map((x) => ({ ...x, reason: 'fusionadas' }));
    const r2 = checkRedirects(inventory, dist, withReason);
    assert.equal(r2.conflicts.length, 0);
    assert.equal(r2.ok, true);
  });

  test('410 es terminal: no exige archivo en dist', () => {
    const dist = makeDist(allPaths().filter((p) => p !== '/privado/'));
    const r = checkRedirects(inventory, dist, [{ from: '/privado/', to: null, status: 410, reason: 'eliminada' }]);
    assert.equal(r.ok, true);
    assert.equal(r.gone, 1);
  });

  test('acepta archivos con extensión y <path>.html en dist', () => {
    const inv = { ...inventory, pages: [{ url: 'http://localhost/doc.pdf', status: 200 }, { url: 'http://localhost/about/', status: 200 }] };
    const dist = tmp('wdk-dist-');
    writeFileSync(join(dist, 'doc.pdf'), 'x');
    writeFileSync(join(dist, 'about.html'), 'x');
    const r = checkRedirects(inv, dist, []);
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Formatos de salida
// ---------------------------------------------------------------------------

describe('mergeVercelRedirects / toCloudflareRedirects', () => {
  const redirects = [
    { from: '/faq/', to: '/preguntas/', status: 301, reason: REASON_SLUG },
    { from: '/equipo/', to: '/nosotros/', status: 301, reason: REASON_PARENT },
    { from: '/privado/', to: null, status: 410, reason: 'eliminada' },
  ];

  test('(f) conserva headers y trailingSlash, hace merge y deduplica por source', () => {
    const vercel = {
      trailingSlash: true,
      headers: [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }],
      redirects: [
        { source: '/faq/', destination: '/viejo/', permanent: true },
        { source: '/otro/', destination: '/nuevo/', permanent: false },
      ],
    };
    const merged = mergeVercelRedirects(vercel, redirects);
    assert.notStrictEqual(merged, vercel);
    assert.deepEqual(merged.headers, vercel.headers);
    assert.equal(merged.trailingSlash, true);
    assert.equal(merged.redirects.length, 3); // /faq/ (reemplazada), /otro/ (conservada), /equipo/ (nueva); 410 excluida
    const faq = merged.redirects.find((r) => r.source === '/faq/');
    assert.deepEqual(faq, { source: '/faq/', destination: '/preguntas/', permanent: true });
    assert.ok(merged.redirects.find((r) => r.source === '/otro/'));
    assert.ok(!merged.redirects.find((r) => r.source === '/privado/'));
    // No muta la entrada
    assert.equal(vercel.redirects.length, 2);
  });

  test('mergeVercelRedirects acepta null/{} como vercel.json inicial', () => {
    const merged = mergeVercelRedirects(null, redirects.slice(0, 1));
    assert.deepEqual(merged, { redirects: [{ source: '/faq/', destination: '/preguntas/', permanent: true }] });
  });

  test('(g) _redirects: `from to 301` por línea', () => {
    const txt = toCloudflareRedirects(redirects);
    const lines = txt.split('\n').filter((l) => l && !l.startsWith('#'));
    assert.deepEqual(lines, ['/faq/ /preguntas/ 301', '/equipo/ /nosotros/ 301']);
    assert.ok(txt.endsWith('\n'));
  });
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

describe('CLI plan-redirects.mjs', () => {
  test('--help sale 0', async () => {
    const r = await run(planScript, ['--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /plan-redirects/);
  });

  test('(a) identidad → exit 0, redirects.json vacío, vercel.json y _redirects escritos', async () => {
    const dir = tmp();
    const mappingFile = writeJson(dir, 'mapping.json', identityMapping());
    const vercelFile = writeJson(dir, 'vercel.json', { trailingSlash: true, headers: [{ source: '/(.*)', headers: [] }] });
    const pub = join(dir, 'public');
    const r = await run(planScript, [inventoryFile, mappingFile, '--out', dir, '--vercel', vercelFile, '--public', pub]);
    assert.equal(r.code, 0, r.stderr);
    const redirects = JSON.parse(readFileSync(join(dir, 'redirects.json'), 'utf8'));
    assert.deepEqual(redirects, []);
    const vercel = JSON.parse(readFileSync(vercelFile, 'utf8'));
    assert.equal(vercel.trailingSlash, true);
    assert.equal(vercel.headers.length, 1);
    assert.deepEqual(vercel.redirects, []);
    assert.ok(existsSync(join(pub, '_redirects')));
  });

  test('(b) con --json imprime el plan y escribe 2 redirects', async () => {
    const dir = tmp();
    const mappingFile = writeJson(dir, 'mapping.json', { ...identityMapping(), '/faq/': '/preguntas/', '/equipo/': null });
    const r = await run(planScript, [inventoryFile, mappingFile, '--out', dir, '--json']);
    assert.equal(r.code, 0, r.stderr);
    const plan = JSON.parse(r.stdout);
    assert.equal(plan.redirects.length, 2);
    const written = JSON.parse(readFileSync(join(dir, 'redirects.json'), 'utf8'));
    assert.equal(written.length, 2);
  });

  test('(c) conflicto → exit 1 con mensaje en español', async () => {
    const dir = tmp();
    const mappingFile = writeJson(dir, 'mapping.json', { ...identityMapping(), '/precios/': '/servicios/', '/galeria/': '/servicios/' });
    const r = await run(planScript, [inventoryFile, mappingFile, '--out', dir]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /conflicto/i);
    assert.match(r.stderr, /\/servicios\//);
  });

  test('página sin mapping → exit 1 listando las faltantes', async () => {
    const dir = tmp();
    const m = identityMapping();
    delete m['/legal/'];
    const mappingFile = writeJson(dir, 'mapping.json', m);
    const r = await run(planScript, [inventoryFile, mappingFile, '--out', dir]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /sin mapping/i);
    assert.match(r.stderr, /\/legal\//);
  });

  test('sin argumentos → exit 1', async () => {
    const r = await run(planScript, []);
    assert.equal(r.code, 1);
  });
});

describe('CLI check-redirects.mjs', () => {
  test('--help sale 0', async () => {
    const r = await run(checkScript, ['--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /check-redirects/);
  });

  test('(a) caso feliz → exit 0', async () => {
    const dist = makeDist(allPaths());
    const r = await run(checkScript, [inventoryFile, dist, '--json']);
    assert.equal(r.code, 0, r.stderr);
    const rep = JSON.parse(r.stdout);
    assert.equal(rep.ok, true);
    assert.equal(rep.orphans.length, 0);
  });

  test('(b) con redirects.json → exit 0 y 0 huérfanas', async () => {
    const dir = tmp();
    const plan = planRedirects(inventory, { ...identityMapping(), '/faq/': '/preguntas/', '/equipo/': null });
    const redirectsFile = writeJson(dir, 'redirects.json', plan.redirects);
    const dist = makeDist([...allPaths().filter((p) => p !== '/faq/' && p !== '/equipo/'), '/preguntas/']);
    const r = await run(checkScript, [inventoryFile, dist, '--redirects', redirectsFile]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /0 huérfanas/);
  });

  test('(d) huérfana → exit 1', async () => {
    const dist = makeDist(allPaths().filter((p) => p !== '/galeria/'));
    const r = await run(checkScript, [inventoryFile, dist]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /huérfana/i);
    assert.match(r.stderr, /\/galeria\//);
  });

  test('(e) bucle → exit 1', async () => {
    const dir = tmp();
    const redirectsFile = writeJson(dir, 'redirects.json', [
      { from: '/faq/', to: '/precios/', status: 301, reason: 'x' },
      { from: '/precios/', to: '/faq/', status: 301, reason: 'y' },
    ]);
    const dist = makeDist(allPaths());
    const r = await run(checkScript, [inventoryFile, dist, '--redirects', redirectsFile, '--json']);
    assert.equal(r.code, 1);
    const rep = JSON.parse(r.stdout);
    assert.equal(rep.loops.length, 2);
  });

  test('(c) conflicto sin reason → exit 1', async () => {
    const dir = tmp();
    const redirectsFile = writeJson(dir, 'redirects.json', [
      { from: '/precios/', to: '/servicios/', status: 301 },
      { from: '/galeria/', to: '/servicios/', status: 301 },
    ]);
    const dist = makeDist(allPaths());
    const r = await run(checkScript, [inventoryFile, dist, '--redirects', redirectsFile]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /conflicto/i);
  });

  test('dist inexistente → exit 1', async () => {
    const r = await run(checkScript, [inventoryFile, join(tmp(), 'nope')]);
    assert.equal(r.code, 1);
  });
});
