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
      // Añade aquí cada página indexable del sitio.
      numberOfRuns: 2,
      settings: {
        // Sin `preset`: el perfil MÓVIL es el default de Lighthouse ('mobile' NO es un valor válido;
        // solo existen 'desktop' | 'perf' | 'experimental'). Los umbrales del kit son móviles.
        // En CI sin red externa no hay nada que bloquear; se deja por si se añade analítica.
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      // La 404 lleva noindex a propósito: nunca puede aprobar la categoría SEO. Se evalúa aparte.
      assertMatrix: [
        {
          matchingUrlPattern: '/404\\.html$',
          assertions: {
            'categories:performance': ['error', { minScore: 0.9 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['error', { minScore: 0.9 }],
          },
        },
        {
          matchingUrlPattern: '^(?!.*404\\.html$).*',
          assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        // Métricas núcleo (IDs vigentes en Lighthouse 13).
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
          },
        },
      ],
    },
    // Informes en local (.lighthouseci/). 'temporary-public-storage' subiría el informe a una URL pública.
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
