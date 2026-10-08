# astro-marketing — plantilla de sitio de marketing

Sitio **100 % estático** con Astro 7, Tailwind 4 (config CSS-first), islas React
solo donde hacen falta y `motion` v14. Cero JavaScript por defecto: las páginas
`/`, `/contacto` y `/404` no cargan ningún script salvo la isla `MotionStats`
de la portada (y solo cuando entra en pantalla).

Verificado el 2026-10-07: `npm install` offline-friendly (solo registro npm),
`astro build` en ~5 s, `astro check` 0 errores, 17/17 tests Playwright (axe +
SEO) en verde.

## Requisitos

- Node **>= 22.12** (Astro 7).
- npm. Instala con `npm install --ignore-scripts --no-fund --no-audit` si el
  entorno no permite scripts de postinstall.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://localhost:4321`. |
| `npm run build` | Genera `dist/` (HTML, CSS, fuentes, imágenes AVIF/WebP, sitemap). |
| `npm run preview` | Sirve `dist/` tal como lo haría producción (404 real incluida). |
| `npm run check` | `astro check`: tipos en `.astro` y `.ts`. |
| `npm test` | Playwright: axe-core en 3 viewports + comprobaciones SEO. Hace `build` + `preview` solo. |
| `npm run test:install` | Descarga Chromium para Playwright (una vez). |
| `npm run lhci` | Lighthouse CI sobre `dist/` con umbrales (perf >= 0.9, a11y = 1, SEO = 1, BP >= 0.9). |

## Estructura

```
astro-marketing/
├── astro.config.mjs        # site, integraciones, Fonts API (proveedor local)
├── src/
│   ├── config/site.ts      # SITE: nombre, URL, locale, nav, contacto (PLACEHOLDER)
│   ├── lib/jsonld.ts       # constructores JSON-LD tipados (sin FAQPage, ver comentario)
│   ├── layouts/Base.astro  # <html lang>, <head> con <SEO>, skip-link, landmarks
│   ├── components/
│   │   ├── SEO.astro       # title, description, canónica, OG/Twitter, robots, JSON-LD
│   │   ├── Header.astro    # adaptativa sobre hero oscuro (color-scheme), menú <details>
│   │   ├── Footer.astro
│   │   ├── Section.astro   # @container + espaciado de sección
│   │   ├── Button.astro
│   │   ├── Card.astro      # subgrid + container query
│   │   └── islands/MotionStats.tsx  # isla React con motion (client:visible)
│   ├── pages/              # index, contacto, 404
│   ├── styles/
│   │   ├── global.css      # @theme con tokens (tokens:start/end), base, utilidades
│   │   └── motion.css      # scroll-driven reveal con @supports + reduced-motion
│   └── assets/             # imágenes procesadas por <Image>/<Picture>
├── public/                 # robots.txt, _headers (Cloudflare), favicon, og-default
├── tests/                  # a11y.spec.ts, seo.spec.ts
├── playwright.config.ts
├── lighthouserc.cjs
├── vercel.json             # solo cabeceras
├── wrangler.jsonc          # Cloudflare Workers Static Assets
└── CLAUDE.md               # convenciones para agentes
```

## Qué es PLACEHOLDER (sustituir antes de publicar)

Busca `PLACEHOLDER` en el proyecto (`grep -rn PLACEHOLDER src public *.json* *.jsonc`).

- `src/config/site.ts`: nombre, URL de producción, descripción, redes, contacto
  (email/teléfono/dirección/horario). Los campos de contacto están a `null`:
  el footer y la página de contacto **no muestran nada** hasta que los rellenes.
  Nunca pongas datos de ejemplo que parezcan reales.
- `public/robots.txt`: la línea `Sitemap:` con el dominio real.
- `public/og-default.png`: PLACEHOLDER generado (1200x630); sustituir por la imagen real de marca; varias
  plataformas no previsualizan SVG.
- `src/assets/hero-placeholder.{svg,jpg}`: la foto real del hero.
- Textos de `index.astro`, `contacto.astro` y las cifras de `MotionStats`
  (están a cero a propósito).
- `contacto.astro`: `FORM_ACTION` apunta a `#`; el formulario no envía nada
  hasta conectar un endpoint (Worker, Formspree, etc.).
- `wrangler.jsonc`: `name` del Worker.

## Tokens de diseño

Todo vive en `src/styles/global.css` entre `/* tokens:start */` y
`/* tokens:end */`, dentro de `@theme`. Un generador DTCG -> `@theme` puede
sobrescribir ese bloque íntegro.

- **Color en OKLCH** con pares `-light`/`-dark` y variantes semánticas
  resueltas con `light-dark()` (`--color-ink`, `--color-paper`,
  `--color-accent`, `--color-accent-ink`…). El esquema lo decide el SO
  (`color-scheme: light dark`); fuerza uno con `<html data-theme="dark">`.
- **Tipografía fluida** con `clamp()` (`--text-xs` … `--text-display`).
- **Espaciado** base 4 px, `--spacing-section` y `--spacing-gutter` fluidos.
- **Radios**, **easing** y **duraciones**.

Para cambiar la marca basta con tocar ese bloque: las clases de Tailwind
(`bg-accent`, `text-ink`, `text-3xl`…) se regeneran solas.

### Contraste

El acento claro (`oklch(53% 0.19 45)`) está calibrado para texto blanco >= 4.5:1
y `--color-accent-ink` cambia a oscuro en modo oscuro. Si cambias el acento,
ejecuta `npm test`: axe fallará si bajas de AA.

## Fuentes

Se usa la **Fonts API nativa de Astro** (`fonts: [...]` en `astro.config.mjs`)
con `fontProviders.local()` apuntando a los `.woff2` de los paquetes
`@fontsource-variable/fraunces` e `@fontsource-variable/inter` (instalados por
npm, sin red en build). Astro:

- copia los archivos a `dist/_astro/fonts/` con hash,
- genera `@font-face` con `font-display: swap` y `font-weight: 100 900`,
- genera una **fuente de respaldo con `size-adjust`/`ascent-override`** para
  evitar saltos de layout,
- inyecta el CSS y un `<link rel="preload">` de la fuente display
  (`<Font cssVariable="--font-fraunces" preload={[{ style: 'normal' }]} />`).

Para cambiar de familia: instala otro `@fontsource-variable/*`, ajusta `src`
en `astro.config.mjs` y mantén las variables `--font-fraunces`/`--font-inter`
(o renómbralas en `global.css`).

## Movimiento

- `motion.css`: `.reveal` (y `.reveal-delay-1..4`), `.marquee-rule` y
  `.hero-media` usan `animation-timeline: view()/scroll()`. Están envueltos en
  `@supports (animation-timeline: view())` **y**
  `@media (prefers-reduced-motion: no-preference)`. El estado por defecto es
  visible: en navegadores sin soporte o con movimiento reducido no se oculta
  nada.
- View Transitions entre documentos con `@view-transition { navigation: auto }`
  (CSS puro). `<ClientRouter/>` existe pero está desactivado (`clientRouter`
  en `Base.astro`) porque añade JS.
- Isla `MotionStats.tsx` con `motion/react`: `client:visible`, respeta
  `useReducedMotion`.

## SEO

- `<SEO>` emite título, descripción, canónica autorreferencial
  (`Astro.site + Astro.url.pathname`), OG/Twitter, `robots` y JSON-LD.
- `src/lib/jsonld.ts`: `organization`, `website`, `localBusiness`,
  `breadcrumb`, `article`, `product`. No hay `FAQPage` (Google eliminó ese
  resultado enriquecido).
- `@astrojs/sitemap` genera `sitemap-index.xml`; `robots.txt` lo referencia.
- `robots.txt` **permite** por defecto a los rastreadores de búsqueda con IA
  (OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot) y también a los de
  entrenamiento (GPTBot, Google-Extended) con bloques comentados listos para
  bloquear solo entrenamiento si el cliente lo pide.

## Despliegue

### Cloudflare Workers (Static Assets)

```sh
npm run build
npx wrangler deploy
```

`wrangler.jsonc` ya trae `assets.directory: "./dist"`,
`not_found_handling: "404-page"` (sirve `404.html` con estado 404) y
`html_handling: "auto-trailing-slash"`. Las cabeceras de seguridad y caché
van en `public/_headers` (se copia a `dist/`).

### Vercel

Importa el repo; Vercel detecta Astro (`npm run build`, salida `dist`).
`vercel.json` solo define **cabeceras**. No añadas un rewrite SPA
(`/(.*) -> /index.html`): rompería la 404 real y generaría soft-404.

### Otros (Netlify, Nginx, S3…)

Es HTML estático: sube `dist/`. Asegúrate de que `404.html` se sirva con
estado 404 y replica las cabeceras de `public/_headers`.

## Tests

```sh
npm run test:install   # una vez: descarga Chromium
npm test
```

- `tests/a11y.spec.ts`: axe-core (WCAG 2.2 AA + best-practice) en 375/768/1280
  px sobre `/`, `/contacto`, `/404`. Falla con violaciones `serious`/`critical`.
- `tests/seo.spec.ts`: title/description, canónica, OG/Twitter, un único
  JSON-LD `Organization`, `lang`, landmarks, 404 real con `noindex`, robots.

`playwright.config.ts` arranca `astro preview --ignore-lock` como `webServer`
(Astro 7 mantiene un lock de preview en segundo plano; sin el flag el proceso
sale si ya hay otro preview en la máquina).

## Lighthouse CI

```sh
npm run build && npm run lhci
```

Asertos por categoría (estables entre versiones de Lighthouse) más avisos de
LCP/CLS/TBT con los IDs vigentes en Lighthouse 13.
