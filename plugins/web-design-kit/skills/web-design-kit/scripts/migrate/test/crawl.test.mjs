/**
 * crawl.test.mjs — pruebas de crawl-site.mjs sobre el fixture wp-like servido con node:http.
 *
 * Ejecutar: node --test plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/
 *
 * Servidor de prueba: `/x/` → `/x/index.html`; `robots.txt`, `sitemap.xml`, `style.css`, `logo.svg`
 * con su content-type; `/tag/*` y `/author/*` (archivos WordPress que el fixture enlaza pero no genera)
 * → 301 a `/blog/`; el resto → 404.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import { crawl, RobotsBlockedError, parseRobots, parseSitemap, isJsOnly } from '../crawl-site.mjs';
import { newInventory, pageFromHtml, rawFileName } from '../lib/inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../../..');
const fixtures = resolve(repoRoot, 'evals/fixtures/wp-like');
const CLI = resolve(here, '../crawl-site.mjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

/** Sirve el directorio del fixture; devuelve {server, origin, close}. */
function serveFixture(root, { robots } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/robots.txt' && robots !== undefined) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(robots);
    }
    if (/^\/legacy\//.test(path)) {
      res.writeHead(301, { location: '/blog/' });
      return res.end();
    }
    const file = path.endsWith('/') ? join(root, path, 'index.html') : join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><html><head><title>404</title></head><body><h1>No encontrada</h1></body></html>');
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return listen(server);
}

/** Sirve rutas en memoria: {path: {status, headers, body}}. */
function serveRoutes(routes) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const r = routes[path];
    if (!r) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<html><body>404</body></html>');
    }
    if (typeof r.delayMs === 'number') {
      return setTimeout(() => {
        res.writeHead(r.status ?? 200, r.headers ?? { 'content-type': 'text/html' });
        res.end(r.body ?? '');
      }, r.delayMs);
    }
    res.writeHead(r.status ?? 200, r.headers ?? { 'content-type': 'text/html; charset=utf-8' });
    res.end(r.body ?? '');
  });
  return listen(server);
}

function listen(server) {
  return new Promise((resolveP) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveP({
        server,
        // `localhost` para que el sitemap del fixture (http://localhost/...) se rebase al origen de prueba.
        origin: `http://localhost:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/** Ejecuta la CLI sin bloquear el event loop (el servidor de prueba vive en este proceso). */
function runCli(args) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolveP({ status, stdout, stderr }));
  });
}

const html = (title, body) =>
  `<!doctype html><html lang="es"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;

// ---------------------------------------------------------------------------
// Fixture wp-like
// ---------------------------------------------------------------------------

describe('crawl-site sobre wp-like', () => {
  let site;
  let out;
  let inv;

  before(async () => {
    assert.ok(existsSync(join(fixtures, 'index.html')), 'fixture wp-like no encontrado (corre evals/fixtures/generate.mjs)');
    site = await serveFixture(fixtures);
    out = mkdtempSync(join(tmpdir(), 'wdk-crawl-'));
    inv = await crawl(`${site.origin}/`, { out, delayMs: 0, quiet: true });
  });
  after(async () => {
    await site.close();
    rmSync(out, { recursive: true, force: true });
  });

  test('forma del inventario', () => {
    assert.equal(inv.version, 1);
    assert.equal(inv.source.kind, 'url');
    assert.equal(inv.source.origin, site.origin);
    assert.equal(inv.source.stack, null);
    assert.match(inv.source.detectedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Array.isArray(inv.pages) && Array.isArray(inv.skipped));
    // H-11: warnings[] siempre presente (también cuando el rastreo no avisa de nada).
    assert.ok(Array.isArray(inv.warnings), 'inventory.warnings debe ser un array');
    assert.ok(Array.isArray(JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8')).warnings));
    assert.equal(typeof inv.stats.fetched, 'number');
    assert.equal(typeof inv.stats.errors, 'number');
    assert.equal(typeof inv.stats.durationMs, 'number');
    for (const p of inv.pages) {
      assert.deepEqual(
        Object.keys(p).sort(),
        ['canonical', 'contentHash', 'description', 'finalUrl', 'h1', 'images', 'jsonld', 'lang', 'links', 'rawFile', 'rendered', 'status', 'title', 'url', 'wordCount'],
        `claves de Page en ${p.url}`,
      );
    }
  });

  test('rastrea las 50 páginas accesibles (51 index.html menos /privado/) y registra 3 rotas con 404', () => {
    const ok = inv.pages.filter((p) => p.status === 200);
    const broken = inv.pages.filter((p) => p.status === 404);
    assert.equal(ok.length, 50, ok.map((p) => p.url).join('\n'));
    assert.equal(broken.length, 3);
    assert.deepEqual(
      broken.map((p) => new URL(p.url).pathname).sort(),
      ['/no-existe-1/', '/no-existe-2/', '/no-existe-3/'],
    );
    assert.equal(inv.pages.length, 53);
    // /duplicada/ solo está en el sitemap: prueba que la semilla del sitemap funciona.
    assert.ok(inv.pages.some((p) => p.url === `${site.origin}/duplicada/`));
    assert.equal(inv.stats.fetched >= 53, true);
  });

  test('la página duplicada comparte contentHash con la original', () => {
    const a = inv.pages.find((p) => p.url === `${site.origin}/nosotros/`);
    const b = inv.pages.find((p) => p.url === `${site.origin}/duplicada/`);
    assert.ok(a && b);
    assert.equal(a.contentHash, b.contentHash);
    assert.notEqual(a.title, b.title);
  });

  test('los enlaces externos no aparecen en pages ni en links', () => {
    assert.ok(!inv.pages.some((p) => p.url.includes('example.org')));
    for (const p of inv.pages) for (const l of p.links) assert.ok(l.startsWith(site.origin), l);
  });

  test('/privado/ (Disallow en robots.txt, sin enlaces entrantes) queda en skipped con reason robots', () => {
    const s = inv.skipped.find((x) => x.url === `${site.origin}/privado/`);
    assert.ok(s, JSON.stringify(inv.skipped));
    assert.equal(s.reason, 'robots');
    assert.equal(s.rule, 'Disallow: /privado/');
    assert.ok(!inv.pages.some((p) => p.url.endsWith('/privado/')));
  });

  test('los archivos /tag/* y /author/* (9) se rastrean como páginas 200, no como rotas ni redirects', () => {
    const archives = inv.pages.filter((p) => /\/(tag|author)\/[^/]+\/$/.test(p.url));
    assert.equal(archives.length, 9);
    assert.ok(archives.every((p) => p.status === 200));
    assert.equal(inv.skipped.filter((x) => x.reason === 'redirect').length, 0);
  });

  test('metadatos por página y raw/<sha1>.html escrito', () => {
    const contacto = inv.pages.find((p) => p.url === `${site.origin}/contacto/`);
    assert.ok(contacto);
    assert.equal(contacto.finalUrl, contacto.url);
    assert.equal(contacto.lang, 'es');
    assert.ok(contacto.title.includes('Contacto'));
    assert.equal(typeof contacto.description, 'string');
    assert.equal(contacto.h1, 'Contacto');
    assert.equal(contacto.jsonld[0]['@type'], 'LocalBusiness');
    assert.equal(contacto.wordCount, 35);
    assert.equal(contacto.rendered, false);
    assert.ok(contacto.images.every((i) => typeof i.src === 'string'));
    assert.equal(contacto.rawFile, `raw/${rawFileName(contacto.url)}`);
    const raw = readFileSync(join(out, contacto.rawFile), 'utf8');
    assert.ok(raw.includes('LocalBusiness'));
    assert.equal(readdirSync(join(out, 'raw')).length, 53);
    const written = JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8'));
    assert.equal(written.pages.length, 53);
  });

  test('--max-pages 5 se detiene en 5 páginas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-max-'));
    try {
      const small = await crawl(`${site.origin}/`, { out: dir, delayMs: 0, maxPages: 5, quiet: true });
      assert.equal(small.pages.length, 5);
      assert.equal(small.stats.fetched >= 5, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

describe('robots.txt', () => {
  test('Disallow: / para * → RobotsBlockedError', async () => {
    const site = await serveFixture(fixtures, { robots: 'User-agent: *\nDisallow: /\n' });
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-robots-'));
    try {
      await assert.rejects(crawl(`${site.origin}/`, { out: dir, delayMs: 0, quiet: true }), RobotsBlockedError);
    } finally {
      await site.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Disallow: / solo para nuestro UA también bloquea; Allow para nuestro UA desbloquea', async () => {
    const blocked = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: web-design-kit-migrate\nDisallow: /\n');
    assert.equal(blocked.isAllowed('/'), false);
    const allowed = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: web-design-kit-migrate\nAllow: /\n');
    assert.equal(allowed.isAllowed('/cualquiera/'), true);
  });

  test('parseRobots: prefijos, comodines, $ y sitemaps', () => {
    const r = parseRobots('User-agent: *\nDisallow: /privado/\nDisallow: /*.pdf$\nAllow: /privado/publico/\nSitemap: https://s.com/a.xml\nsitemap: https://s.com/b.xml\n');
    assert.equal(r.isAllowed('/privado/'), false);
    assert.equal(r.isAllowed('/privado/x/'), false);
    assert.equal(r.isAllowed('/privado/publico/'), true);
    assert.equal(r.isAllowed('/docs/a.pdf'), false);
    assert.equal(r.isAllowed('/docs/a.pdf/'), true);
    assert.equal(r.isAllowed('/blog/'), true);
    assert.deepEqual(r.sitemaps, ['https://s.com/a.xml', 'https://s.com/b.xml']);
  });

  test('CLI: robots bloqueante → exit 1 con explicación en español', async () => {
    const site = await serveFixture(fixtures, { robots: 'User-agent: *\nDisallow: /\n' });
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-cli-'));
    try {
      const r = await runCli([`${site.origin}/`, '--out', dir, '--delay-ms', '0']);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /robots\.txt/);
      assert.match(r.stderr, /bloquea|prohíbe/i);
    } finally {
      await site.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Redirecciones, contenido no HTML, JS-only
// ---------------------------------------------------------------------------

describe('redirecciones y tipos de contenido', () => {
  let site;
  let out;
  let inv;

  before(async () => {
    site = await serveRoutes({
      '/': {
        body: html(
          'Inicio',
          '<h1>Inicio</h1><p>' + 'palabra '.repeat(50) + '</p>' +
            '<a href="/fuera/">fuera</a> <a href="/viejo/">viejo</a> <a href="/doc.pdf">pdf</a> ' +
            '<a href="/spa/">spa</a> <a href="/lento/">lento</a>',
        ),
      },
      '/fuera/': { status: 301, headers: { location: 'https://example.com/pagina' }, body: '' },
      '/viejo/': { status: 302, headers: { location: '/nuevo/' }, body: '' },
      '/nuevo/': { body: html('Nuevo', '<h1>Nuevo</h1><p>Contenido nuevo.</p>') },
      '/doc.pdf': { headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' },
      '/spa/': { body: '<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>' },
      '/lento/': { delayMs: 400, body: html('Lento', '<p>tarde</p>') },
    });
    out = mkdtempSync(join(tmpdir(), 'wdk-crawl-redir-'));
    inv = await crawl(`${site.origin}/`, { out, delayMs: 0, timeoutMs: 100, quiet: true });
  });
  after(async () => {
    await site.close();
    rmSync(out, { recursive: true, force: true });
  });

  test('redirección a otro origen: se registra status/finalUrl y no se rastrea', () => {
    const s = inv.skipped.find((x) => x.url === `${site.origin}/fuera/`);
    assert.ok(s, JSON.stringify(inv.skipped));
    assert.equal(s.reason, 'external-redirect');
    assert.equal(s.status, 301);
    assert.equal(s.finalUrl, 'https://example.com/pagina');
    assert.ok(!inv.pages.some((p) => p.url.includes('example.com')));
  });

  test('redirección interna: el destino se rastrea una vez, el origen queda como redirect', () => {
    const s = inv.skipped.find((x) => x.url === `${site.origin}/viejo/`);
    assert.equal(s.reason, 'redirect');
    assert.equal(s.status, 302);
    assert.equal(s.finalUrl, `${site.origin}/nuevo/`);
    assert.equal(inv.pages.filter((p) => p.url === `${site.origin}/nuevo/`).length, 1);
  });

  test('content-type no HTML → skipped non-html', () => {
    const s = inv.skipped.find((x) => x.url === `${site.origin}/doc.pdf`);
    assert.equal(s.reason, 'non-html');
    assert.equal(s.status, 200);
  });

  test('JS-only sin --render → página con rendered:false y skipped js-only', () => {
    const page = inv.pages.find((p) => p.url === `${site.origin}/spa/`);
    assert.ok(page);
    assert.equal(page.rendered, false);
    assert.ok(page.wordCount < 40);
    const s = inv.skipped.find((x) => x.url === `${site.origin}/spa/`);
    assert.equal(s.reason, 'js-only');
  });

  test('timeout → skipped error y stats.errors', () => {
    const s = inv.skipped.find((x) => x.url === `${site.origin}/lento/`);
    assert.ok(s, JSON.stringify(inv.skipped));
    assert.equal(s.reason, 'error');
    assert.ok(inv.stats.errors >= 1);
  });

  test('--render sin Playwright instalado: avisa y sigue con js-only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-render-'));
    const warnings = [];
    try {
      const r = await crawl(`${site.origin}/spa/`, {
        out: dir, delayMs: 0, render: true, quiet: true, maxPages: 1,
        warn: (m) => warnings.push(m),
        importPlaywright: async () => { throw new Error('Cannot find package'); },
      });
      const page = r.pages.find((p) => p.url === `${site.origin}/spa/`);
      assert.equal(page.rendered, false);
      assert.equal(r.skipped.find((x) => x.url === page.url)?.reason, 'js-only');
      assert.ok(warnings.some((w) => /playwright/i.test(w)), JSON.stringify(warnings));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--render con Playwright (simulado) → rendered:true y contenido renderizado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-render2-'));
    const rendered = html('App', '<h1>App renderizada</h1><p>' + 'texto '.repeat(60) + '</p>');
    const fakePlaywright = {
      chromium: {
        launch: async () => ({
          newPage: async () => ({
            goto: async () => {},
            content: async () => rendered,
            close: async () => {},
          }),
          close: async () => {},
        }),
      },
    };
    try {
      const r = await crawl(`${site.origin}/spa/`, {
        out: dir, delayMs: 0, render: true, quiet: true, maxPages: 1,
        importPlaywright: async () => fakePlaywright,
      });
      const page = r.pages.find((p) => p.url === `${site.origin}/spa/`);
      assert.equal(page.rendered, true);
      assert.equal(page.h1, 'App renderizada');
      assert.ok(page.wordCount >= 40);
      assert.ok(!r.skipped.some((x) => x.url === page.url));
      assert.ok(readFileSync(join(dir, page.rawFile), 'utf8').includes('App renderizada'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Unidades: sitemap, JS-only, inventory.mjs
// ---------------------------------------------------------------------------

describe('unidades', () => {
  test('parseSitemap: urlset, sitemapindex y rebase de host coincidente', () => {
    const urlset = parseSitemap('<urlset><url><loc>http://localhost/a/</loc></url><url><loc>http://localhost/b</loc></url><url><loc>https://otro.com/c/</loc></url></urlset>', 'http://localhost:9999');
    assert.deepEqual(urlset, { kind: 'urlset', urls: ['http://localhost:9999/a/', 'http://localhost:9999/b/'], otherHosts: ['otro.com'] });
    const index = parseSitemap('<sitemapindex><sitemap><loc>https://www.s.com/post-sitemap.xml</loc></sitemap></sitemapindex>', 'https://s.com');
    assert.deepEqual(index, { kind: 'sitemapindex', urls: ['https://s.com/post-sitemap.xml'], otherHosts: [] });
  });

  test('H2-03: sitemap cuyo host no coincide con el del rastreo → aviso en inventory.warnings con el host sugerido', async () => {
    const site = await serveRoutes({
      '/': { body: html('Inicio', '<p>' + 'hola '.repeat(60) + '</p><a href="/a/">a</a>') },
      '/a/': { body: html('A', '<p>' + 'texto '.repeat(60) + '</p>') },
      '/sitemap.xml': {
        headers: { 'content-type': 'application/xml' },
        body: '<urlset><url><loc>http://sitio-canonico.test/</loc></url><url><loc>http://sitio-canonico.test/solo-sitemap/</loc></url></urlset>',
      },
    });
    const dir = mkdtempSync(join(tmpdir(), 'wdk-crawl-sitemap-host-'));
    try {
      // El servidor escucha en localhost; rastreamos por 127.0.0.1 para que el origen no coincida con el <loc>.
      const origin = site.origin.replace('localhost', '127.0.0.1');
      const inv = await crawl(`${origin}/`, { out: dir, delayMs: 0, quiet: true });
      assert.ok(Array.isArray(inv.warnings));
      const w = inv.warnings.find((x) => /sitemap/i.test(x));
      assert.ok(w, `sin aviso de sitemap: ${JSON.stringify(inv.warnings)}`);
      assert.match(w, /2 URL/);
      assert.match(w, /sitio-canonico\.test/);
      assert.match(w, /127\.0\.0\.1/);
      assert.ok(!inv.pages.some((p) => p.url.includes('/solo-sitemap/')), 'las URL de otro host no se rastrean');
    } finally {
      await site.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('isJsOnly', () => {
    const few = '<html><body><div id="__next"></div></body></html>';
    assert.equal(isJsOnly(few, 'https://s.com/'), true);
    assert.equal(isJsOnly('<html><body><div id="app"></div></body></html>', 'https://s.com/'), true);
    assert.equal(isJsOnly('<html><body><p>hola</p></body></html>', 'https://s.com/'), false);
    assert.equal(isJsOnly('<html><body><p>hola</p></body></html>', 'https://x.wixsite.com/'), true);
    assert.equal(isJsOnly('<html><body><div id="root"></div><p>' + 'palabra '.repeat(50) + '</p></body></html>', 'https://s.com/'), false);
  });

  test('inventory.mjs: newInventory y pageFromHtml', () => {
    const inv = newInventory({ kind: 'dir', origin: '/tmp/x', stack: 'static' });
    assert.equal(inv.version, 1);
    assert.deepEqual(Object.keys(inv.source), ['kind', 'origin', 'stack', 'detectedAt']);
    assert.deepEqual(inv.pages, []);
    assert.deepEqual(inv.skipped, []);
    assert.deepEqual(Object.keys(inv.stats), ['fetched', 'errors', 'durationMs']);

    const page = pageFromHtml({
      url: 'https://s.com/a/',
      status: 200,
      finalUrl: 'https://s.com/a/',
      html: '<html lang="en"><head><title>T</title><meta name="description" content="D"><link rel="canonical" href="https://s.com/a/"></head><body><main><h1>Hola <b>mundo</b></h1><p>uno dos</p><a href="/b/">b</a><a href="https://o.com/">o</a><img src="/i.png" alt="i"></main></body></html>',
      rawFile: 'raw/x.html',
      rendered: false,
    });
    assert.equal(page.title, 'T');
    assert.equal(page.description, 'D');
    assert.equal(page.canonical, 'https://s.com/a/');
    assert.equal(page.h1, 'Hola mundo');
    assert.equal(page.lang, 'en');
    assert.equal(page.wordCount, 5); // 'Hola mundo uno dos bo' (los <a> adyacentes se pegan)
    assert.deepEqual(page.links, ['https://s.com/b/']);
    assert.equal(page.images[0].src, 'https://s.com/i.png');
    assert.match(page.contentHash, /^[0-9a-f]{40}$/);
    assert.equal(page.rendered, false);
    assert.equal(page.rawFile, 'raw/x.html');
  });

  test('rawFileName es sha1(url).html', () => {
    const expected = `${createHash('sha1').update('https://s.com/').digest('hex')}.html`;
    assert.equal(rawFileName('https://s.com/'), expected);
    assert.match(expected, /^[0-9a-f]{40}\.html$/);
  });
});
