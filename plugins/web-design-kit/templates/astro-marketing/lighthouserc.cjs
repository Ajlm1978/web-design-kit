/**
 * Lighthouse CI (@lhci/cli 0.15 → Lighthouse 13).
 * Uso: `npm run build && npx lhci autorun`
 *
 * Nota Lighthouse 13: varios IDs de auditoría cambiaron respecto a <= 12
 * (p. ej. `first-contentful-paint`, `largest-contentful-paint`, `cumulative-layout-shift`
 * se mantienen; `total-blocking-time` sigue; `interactive` fue retirado).
 * Aquí se asertan categorías, que son estables entre versiones.
 */
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['http://localhost/', 'http://localhost/contacto/', 'http://localhost/404.html'],
      numberOfRuns: 2,
      settings: {
        preset: 'mobile', // los umbrales del kit (quality-gates.md) son MOBILE; desktop solo para diagnóstico
        // En CI sin red externa no hay nada que bloquear; se deja por si se añade analítica.
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        // Métricas núcleo (IDs vigentes en Lighthouse 13).
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        // La 404 lleva noindex a propósito; no fallar por ello.
        'is-crawlable': 'off',
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
