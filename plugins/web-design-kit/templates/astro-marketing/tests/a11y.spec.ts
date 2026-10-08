/**
 * Accesibilidad automática con axe-core en 3 viewports.
 * Falla si hay violaciones `serious` o `critical`. Las `minor`/`moderate` se
 * listan en consola para revisarlas, pero no rompen el build.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/contacto', '/404'] as const;
const VIEWPORTS = [
  { name: 'movil', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'escritorio', width: 1280, height: 800 },
] as const;

const SCHEMES = ['light', 'dark'] as const;

for (const scheme of SCHEMES)
for (const viewport of VIEWPORTS) {
  test.describe(`a11y @ ${viewport.name} (${viewport.width}px) [${scheme}]`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme });

    for (const path of PAGES) {
      test(`${path} sin violaciones serias/críticas`, async ({ page }) => {
        const response = await page.goto(path);
        // /404 debe existir como página (preview sirve 404.html con estado 404).
        expect(response, 'sin respuesta').not.toBeNull();

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();

        const blocking = results.violations.filter((v) =>
          v.impact === 'serious' || v.impact === 'critical',
        );
        const advisory = results.violations.filter((v) => !blocking.includes(v));
        if (advisory.length) {
          console.log(
            `[a11y:${viewport.name}] ${path} avisos no bloqueantes:`,
            advisory.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join(', '),
          );
        }

        expect(
          blocking,
          blocking.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
        ).toEqual([]);
      });
    }
  });
}
