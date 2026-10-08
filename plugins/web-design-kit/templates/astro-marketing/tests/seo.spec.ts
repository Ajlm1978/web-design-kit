/**
 * Comprobaciones SEO básicas del HTML generado.
 */
import { test, expect } from '@playwright/test';

test.describe('SEO portada', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('title y meta description presentes y con longitud razonable', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(5);
    expect(title.length).toBeLessThanOrEqual(70);

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(20);
    expect(description!.length).toBeLessThanOrEqual(170);
  });

  test('canónica autorreferencial absoluta', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const href = await canonical.getAttribute('href');
    expect(href).toMatch(/^https?:\/\/.+\/$/);
  });

  test('Open Graph y Twitter', async ({ page }) => {
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toBe(await page.title());

    for (const prop of ['og:description', 'og:url', 'og:image', 'og:type']) {
      await expect(page.locator(`meta[property="${prop}"]`), prop).toHaveCount(1);
    }
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toMatch(/^https?:\/\//);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });

  test('exactamente un JSON-LD Organization válido', async ({ page }) => {
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(scripts.length).toBeGreaterThan(0);

    const parsed = scripts.map((s) => JSON.parse(s) as Record<string, unknown>);
    const orgs = parsed.filter((d) => d['@type'] === 'Organization');
    expect(orgs).toHaveLength(1);
    expect(orgs[0]['@context']).toBe('https://schema.org');
    expect(orgs[0]['name']).toBeTruthy();
    expect(orgs[0]['url']).toMatch(/^https?:\/\//);
  });

  test('html lang y landmarks', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
  });
});

test.describe('SEO otras páginas', () => {
  test('/contacto tiene canónica propia', async ({ page }) => {
    await page.goto('/contacto/');
    const href = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(href).toMatch(/\/contacto\/?$/);
  });

  test('404 real con noindex', async ({ page }) => {
    const response = await page.goto('/esta-pagina-no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('robots.txt apunta al sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toMatch(/Sitemap:\s*https?:\/\/.+sitemap-index\.xml/);
  });
});
