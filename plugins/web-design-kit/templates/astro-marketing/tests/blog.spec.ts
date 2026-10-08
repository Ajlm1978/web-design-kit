/**
 * Blog (colección `blog`): índice, post, JSON-LD Article, canónica y sitemap.
 *
 * Estrategia: el `webServer` de Playwright construye y sirve `dist/` UNA vez para toda la suite
 * (con la colección tal cual esté en el repo). Para probar el blog con contenido sin tocar ese
 * `dist/` ni interferir con los demás tests (que corren en paralelo), este archivo:
 *   1. escribe un post de prueba en `src/content/blog/ejemplo-test.md`,
 *   2. construye en un `outDir` aislado (`.astro/blog-test/dist`) y lo sirve con `astro preview`
 *      en un puerto libre,
 *   3. al terminar borra el post y el build aislado.
 * Verificado 2026-10-08: `astro build/preview --outDir` respetan el flag (Astro 7.3.7).
 *
 * El bloque "sin posts" se comprueba contra el servidor principal (baseURL). Si el proyecto ya
 * tiene posts reales, esas aserciones se invierten (index + sitemap) para seguir siendo válidas
 * en un sitio migrado.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog');
const POST_FILE = join(BLOG_DIR, 'ejemplo-test.md');
const OUT_DIR = join(ROOT, '.astro', 'blog-test', 'dist');
// Binario de Astro resuelto desde node_modules (sin pasar por npx ni por .bin/, que en Windows es .cmd).
const ASTRO_BIN = join(createRequire(import.meta.url).resolve('astro/package.json'), '..', 'bin', 'astro.mjs');

const POST = `---
title: "Ejemplo de post de prueba"
description: "Post temporal creado por tests/blog.spec.ts para verificar índice, canónica y JSON-LD."
date: "2024-05-01"
author: null
tags:
  - "pruebas"
  - "migración"
---

## Primer apartado

Texto con **negrita** y un [enlace](https://example.com/).

- Punto uno
- Punto dos
`;

/** ¿Hay posts reales (no el de prueba) en la colección? */
function realPosts(): string[] {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR, { recursive: true })
    .map(String)
    .filter((f) => /\.mdx?$/i.test(f) && !/(^|[\\/])ejemplo-test\.md$/.test(f));
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

async function waitFor(url: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`El preview aislado no respondió en ${ms} ms: ${String(lastErr)}`);
}

test.describe('Blog sin posts (servidor principal)', () => {
  const hasReal = realPosts().length > 0;

  test(`/blog/ responde 200 y ${hasReal ? 'es indexable' : 'lleva noindex'}`, async ({ page }) => {
    const res = await page.goto('/blog/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    if (hasReal) expect(robots).not.toMatch(/noindex/);
    else expect(robots).toMatch(/noindex/);
    // La canónica se emite igualmente (noindex y canónica no son excluyentes).
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/$/);
  });

  test(`sitemap ${hasReal ? 'incluye' : 'excluye'} /blog/`, async ({ request }) => {
    const res = await request.get('/sitemap-0.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    if (hasReal) expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/blog\/<\/loc>/);
    else expect(xml).not.toMatch(/\/blog(\/|<)/);
  });
});

test.describe('Blog con un post (build aislado)', () => {
  test.describe.configure({ mode: 'serial' });

  let server: ChildProcess | undefined;
  let origin = '';
  let createdPost = false;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (existsSync(POST_FILE)) {
      throw new Error(`${POST_FILE} ya existe; bórralo antes de correr los tests (lo crea y destruye este archivo).`);
    }
    mkdirSync(BLOG_DIR, { recursive: true });
    writeFileSync(POST_FILE, POST, 'utf8');
    createdPost = true;

    rmSync(OUT_DIR, { recursive: true, force: true });
    execFileSync(process.execPath, [ASTRO_BIN, 'build', '--outDir', OUT_DIR], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const port = await freePort();
    origin = `http://localhost:${port}`;
    server = spawn(
      process.execPath,
      [ASTRO_BIN, 'preview', '--outDir', OUT_DIR, '--port', String(port), '--host', 'localhost', '--ignore-lock'],
      { cwd: ROOT, stdio: 'ignore', env: { ...process.env, FORCE_COLOR: '0' } },
    );
    await waitFor(`${origin}/blog/`, 30_000);
  });

  test.afterAll(async () => {
    server?.kill();
    if (createdPost) rmSync(POST_FILE, { force: true });
    rmSync(join(ROOT, '.astro', 'blog-test'), { recursive: true, force: true });
  });

  test('/blog/ lista el post, indexable y con <time datetime>', async ({ page }) => {
    const res = await page.goto(`${origin}/blog/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Ejemplo de post de prueba' })).toHaveAttribute('href', '/blog/ejemplo-test/');
    await expect(page.locator('time[datetime="2024-05-01"]').first()).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).not.toMatch(/noindex/);
  });

  test('/blog/ejemplo-test/ tiene Article JSON-LD, canónica propia y fecha', async ({ page }) => {
    const res = await page.goto(`${origin}/blog/ejemplo-test/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText('Ejemplo de post de prueba');

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^https?:\/\/.+\/blog\/ejemplo-test\/$/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);
    await expect(page.locator('article time[datetime="2024-05-01"]')).toHaveCount(1);

    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(scripts.join('\n')).toContain('"@type":"Article"');
    const parsed = scripts.map((s) => JSON.parse(s) as Record<string, unknown>);
    const art = parsed.find((d) => d['@type'] === 'Article')!;
    expect(art['headline']).toBe('Ejemplo de post de prueba');
    expect(art['datePublished']).toMatch(/^2024-05-01/);
    expect(art['mainEntityOfPage']).toBe(canonical);
    expect(art['author']).toBeTruthy();
    const crumbs = parsed.find((d) => d['@type'] === 'BreadcrumbList');
    expect(crumbs).toBeTruthy();

    // Markdown renderizado dentro de <Prose>.
    await expect(page.locator('.prose-kit h2')).toHaveText('Primer apartado');
    await expect(page.locator('.prose-kit li')).toHaveCount(2);
  });

  test('sitemap del build con posts incluye /blog/ y el post', async () => {
    const xml = await (await fetch(`${origin}/sitemap-0.xml`)).text();
    expect(xml).toMatch(/\/blog\/<\/loc>/);
    expect(xml).toMatch(/\/blog\/ejemplo-test\/<\/loc>/);
  });

  test('post sin violaciones a11y serias/críticas', async ({ page }) => {
    await page.goto(`${origin}/blog/ejemplo-test/`);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking,
      blocking.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
    ).toEqual([]);
  });
});
