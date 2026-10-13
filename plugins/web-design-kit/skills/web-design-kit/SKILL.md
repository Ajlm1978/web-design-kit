---
name: web-design-kit
description: |
  Construye sitios web profesionales e impecables (landing, corporativo, portfolio,
  restaurante/negocio local, e-commerce, SaaS) con Astro 7 + Tailwind 4 por defecto y
  Next.js 16 para apps/dashboards. Cubre todo el ciclo: brief → dirección de diseño y
  tokens (anti "AI-slop") → scaffolding desde plantilla verificada → construir → SEO 2026
  (HTML prerenderizado, JSON-LD, robots con política IA) → motion (CSS first, reduced
  motion) → gates de calidad (axe, Lighthouse 13, check-seo) → deploy (Cloudflare
  Workers Static Assets o Vercel). Usar cuando el usuario diga "nueva web", "landing",
  "sitio para mi negocio", "rediseño", "que se vea profesional", "SEO del sitio",
  "animaciones", "publicar la web". No usar para apps con login complejo sin parte
  pública (usar la plantilla Next directamente) ni para revisar sitios ajenos (usar
  seo-audit / design-critique).
license: MIT
metadata:
  version: "2.1.1"
  last_verified: "2026-10-13"
  author: "Amilcar Leong"
---

# web-design-kit — sitios profesionales de cero a publicado

Eres el arquitecto/a de un sitio web production-grade. El kit es **autocontenido**: plantilla,
tokens, doctrina de diseño, SEO, motion, gates y deploy viven aquí. No dependas de skills externas.
Todo lo que afirmes sobre versiones sale de `references/versions.md` (fecha de verificación incluida).

## Reglas que no se rompen
1. **HTML prerenderizado.** Marketing/contenido = Astro estático. SPA solo detrás de login.
2. **Nada inventado.** Contacto, cifras, testimonios, precios: dato real del cliente o `PLACEHOLDER`
   visible. Nunca entregues un sitio con `PLACEHOLDER` sin avisarlo.
3. **Brief antes de píxeles.** Tokens derivados del brief (`references/design-anti-slop.md`),
   nunca los defaults (Inter, degradado violeta, hero centrado + 3 tarjetas).
4. **Una idea de movimiento por página**, `prefers-reduced-motion` siempre respetado.
5. **Maker ≠ checker.** Quien construye no audita: las skills `seo-audit` y `design-critique`
   las ejecuta otra sesión/agente.
6. **Gates o no está listo.** `references/quality-gates.md` define el Definition of Done.

## Flujo (en orden)

### 0. Brief (una sola ronda de preguntas, concisa)
Pregunta solo lo que no sepas: nombre y qué vende · tipo de sitio · idioma(s) y **país/ciudad**
(fija `locale`/`ogLocale`: Miami → `es_US`, Madrid → `es_ES`, CDMX → `es_MX`) · público y adjetivos
de marca (3) · páginas necesarias · datos reales disponibles (logo, fotos, copy, contacto) · hosting
preferido · ¿permitir buscadores IA / bloquear entrenamiento? (ver seo.md §4).
Si el usuario no sabe, propone un default y márcalo como decisión reversible.

**Con `--from <brief.json>` (reconstrucción tras `/migrate-site`) el brief ya existe.** Valídalo con
`validateBrief` de `scripts/migrate/lib/brief.mjs` (comando exacto en `commands/new-website.md` §0-bis); si
no valida, STOP. **No preguntes nada cuyo `sources[campo].confidence` sea `high`.** Confirma en una sola
ronda lo `medium`/`low` y lo `null`, y pregunta solo: (a) dirección de diseño — default *conservar marca,
rehacer layout*: `brand.colors` → semillas de `tokens.json`, `brand.fonts[].fontsource` → paquetes
`@fontsource-variable/*`; (b) qué páginas antiguas se descartan (→ `mapping.json`, 301 al padre).
Luego: posts (`type: post`) → `src/content/blog/<slug>.md`; páginas → `src/content/pages/<slug>.md` +
`src/pages/<slug>.astro` con `<Prose><Content /></Prose>`; imágenes → `src/assets/migrated/`;
`showBlog: true` en `site.ts` si hay posts. Doctrina: `references/migration.md`.

**Si el tipo es `local`, pregunta explícitamente si atienden al público en una dirección física.**
Sin dirección no emitas `LocalBusiness` (Google lo ignora o lo marca): usa `Organization` +
`areaServed`, o `ProfessionalService`/`FinancialService` solo cuando haya dirección. Una consultora
que atiende por cita o a distancia suele ser `corporativo`, no `local`; dilo y deja que el usuario decida.

### 1. Elegir plantilla
| Caso | Plantilla | Por qué |
|---|---|---|
| Landing, corporativo, portfolio, negocio local, blog, tienda sin login | `templates/astro-marketing` | Cero JS por defecto, SEO en HTML, build en segundos |
| SaaS con dashboard, área privada, personalización por usuario | Next.js 16.4 (`references/stack-next.md`) | Cache Components, RSC |
| Cliente exige React-only con SEO | React Router 8 framework mode + prerender | Nunca SPA v6 |

### 2. Scaffold
Copia `templates/astro-marketing/` al directorio del proyecto (no sobreescribas un proyecto
existente: si hay `package.json`, pregunta). Luego:
```bash
npm install --ignore-scripts --no-fund --no-audit   # primera pasada sin scripts de terceros
npm run check && npm run build                      # debe quedar verde ANTES de tocar nada
```
Edita `src/config/site.ts` (nombre, URL, locale, nav, contacto real o `null`) y `astro.config.mjs`
(`site`). Hosting: `wrangler.jsonc` (Cloudflare, recomendado) o `vercel.json` ya listos.

### 3. Dirección de diseño y tokens
1. Elige una dirección de `references/design-anti-slop.md` (6 recetas) o deriva una del brief.
2. Copia `assets/tokens.example.json` → `tokens.json`, ajusta paleta OKLCH, fuentes, radio, escala.
3. `node <kit>/scripts/tokens-to-theme.mjs tokens.json src/styles/global.css` (regenera solo el
   bloque `@theme` entre `tokens:start/end`). Detalle: `references/tokens-dtcg.md`,
   `references/typography.md`.
4. Fuentes: Astro Fonts API con `fontProviders.local()` + `@fontsource-variable/*` (sin red en
   build, subset y preload automáticos).

### 4. Construir
- Arquitectura de información desde el contenido real, no desde la plantilla.
- Componentes del template (`Section`, `Card`, `Button`, `Header`, `Footer`) + container queries y
  subgrid. Islas React (`client:visible`) solo para interacción real.
- SEO por página con `<SEO>` + builders de `src/lib/jsonld.ts` (Organization/WebSite una vez;
  LocalBusiness, Product, Article, BreadcrumbList por plantilla). Sin FAQPage ni HowTo.
  Doctrina completa: `references/seo.md`.
- Blog: colección `blog` (`src/content.config.ts`, un `.md` por post en `src/content/blog/`) con
  `/blog/` y `/blog/<slug>/` ya hechos (Article + BreadcrumbList, canónica, `<time>`). Sin posts,
  `/blog/` es `noindex` y queda fuera del sitemap; con posts, `showBlog: true` en `site.ts`.
- Motion: `references/motion.md` + snippets en `assets/motion/` (reveal, view transitions,
  starting-style, isla motion v14, GSAP/Lenis opt-in).
- Accesibilidad: `references/a11y-eaa.md` (WCAG 2.2 AA; EAA aplica a ventas a la UE).

### 5. Verificar (gates)
```bash
npm run check && npm run build
npx playwright install chromium && npm test                  # axe light+dark, 3 viewports + SEO
node <kit>/scripts/check-seo.mjs dist --site https://dominio.com
npx lhci autorun                                              # Lighthouse 13, preset mobile
grep -rn PLACEHOLDER src/ dist/                               # debe estar vacío antes de entregar
```
Luego pide a otra sesión que ejecute `seo-audit` y `design-critique`. Corrige hallazgos; repite.

### 6. Deploy
`references/deploy.md`: Cloudflare `npx wrangler deploy` (≈$0 estático) o Vercel. Sin rewrite SPA.
Post-deploy: 404 real con `curl -I`, Search Console + sitemap, Bing/IndexNow, Google Business
Profile si es negocio local.

### 7. Cerrar
Resume al usuario: qué se construyó, gates con evidencia, `PLACEHOLDER` pendientes, decisiones
reversibles y siguiente paso. Si el proyecto tiene `CLAUDE.md`/KB, actualízalo.

## Mapa de referencias (cárgalas solo cuando toque)
| Archivo | Cuándo |
|---|---|
| `references/versions.md` | Antes de instalar o afirmar una versión. `scripts/check-versions.mjs` para drift. |
| `references/design-anti-slop.md` | Paso 3 y antes de cualquier decisión visual. |
| `references/tokens-dtcg.md`, `references/typography.md` | Tokens, fuentes, escala tipográfica. |
| `references/seo.md` | Metadatos, JSON-LD, robots/IA, local SEO, lanzamiento. |
| `references/motion.md` | Cualquier animación. |
| `references/a11y-eaa.md` | Formularios, diálogos, contraste, obligaciones legales. |
| `references/quality-gates.md` | Definition of Done y presupuestos. |
| `references/deploy.md` | Cloudflare/Vercel, cabeceras, DNS, post-deploy. |
| `references/stack-next.md` | Solo si el caso es app/SaaS. |
| `references/migration.md` | Reconstruir un sitio existente (`--from brief.json`, `/migrate-site`): 301, paridad, hreflang, Search Console. |

## Herramientas opcionales (no dependencias)
- MCP `magic` (21st.dev) declarado en el plugin: inspiración de componentes. Requiere
  `MAGIC_API_KEY`; su output viene en Next/shadcn → **adaptar** a los tokens, nunca pegar crudo.
- shadcn/ui (Base UI por defecto desde jul-2026) para primitivas interactivas en islas React.
