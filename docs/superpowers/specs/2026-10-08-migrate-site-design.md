# Spec — `/migrate-site` (WDK-007)

Fecha: 2026-10-08 · Estado: aprobado en diseño · Alcance: una iteración implementable.

## Objetivo
Dado un sitio existente (URL pública, carpeta local o repo Git), producir: (1) una auditoría vendible del
sitio actual, (2) el contenido real extraído en Markdown + un `brief.json`, y (3) un sitio nuevo construido
con el kit que conserve la marca, rehaga el layout, migre todo el blog y no pierda ninguna URL (301 + paridad).

## Decisiones del usuario (2026-10-08)
- Diseño: **rediseñar conservando la marca** (logo, colores, tipografías como semilla de tokens).
- Blog: **migrar todos los posts** a Markdown, cada uno con su redirect.
- **Autorización obligatoria** antes de rastrear: el usuario confirma ser dueño o tener permiso escrito.

## Entradas
`/web-design-kit:migrate-site --url <https://…> | --dir <ruta> | --repo <owner/repo | url git>` + opciones
`--max-pages 300` (URL) · `--render` (forzar Playwright) · `--out migration/` · `--lang es|en`.

## Fases y artefactos (todo bajo `migration/` en el directorio del proyecto nuevo)
| Fase | Script / skill | Artefacto | Gate |
|---|---|---|---|
| 0 Autorización | skill | pregunta y registro en `migration/AUTHORIZATION.md` (quién, fecha, base) | sin "sí" → STOP |
| 1 Inventario | `crawl-site.mjs` (URL) · `scan-source.mjs` (dir/repo) | `inventory.json` + `raw/<hash>.html` | ≥1 página; sin errores de red fatales |
| 2 Auditoría | `audit-site.mjs` (reusa reglas de `check-seo.mjs` sobre `raw/`) + Lighthouse en top 5 | `audit.md` | siempre se genera |
| 3 Extracción | `extract-content.mjs` | `content/<slug>.md` · `brief.json` · `assets/` (imágenes) | brief válido contra `brief.schema.json` |
| 4 Reconstrucción | `/new-website --from migration/brief.json` | proyecto Astro | gates del kit |
| 5 Redirects/paridad | `check-redirects.mjs` | `redirects.json` → `vercel.json`/`_redirects` | 0 URLs antiguas sin destino |

### 1 Inventario
- **URL:** `robots.txt` (respetar Disallow para el UA `web-design-kit-migrate`), sitemaps (index + hijos),
  BFS mismo origen, 2 req/s, timeout 15 s, máx. `--max-pages`. Normaliza URLs (sin fragmento, sin utm, barra final).
  Por página: `url, status, finalUrl, title, description, canonical, h1, lang, wordCount, links[], images[], jsonld[], contentHash`.
  Detección de JS-only: `wordCount < 40` y `<div id="root|__next|app">` o dominio `wixsite|squarespace` → re-render
  con Playwright (`@playwright/test` ya es devDep del template; si no está instalado, avisar y seguir sin render).
- **dir/repo:** detecta stack por marcadores: WXR (`<rss … xmlns:wp>`), WordPress (wp-content), HTML estático,
  Astro (`astro.config`), Next (`next.config`, `app/|pages/`), Hugo/Jekyll (`content/|_posts/`), React SPA
  (`index.html` + `src/main`). Para WXR: parsea `<item>` → páginas/posts/adjuntos. Para frameworks: lista rutas por
  convención de archivos y, si hay `package.json` con script `build`, **ofrece** construir (`--build`) y
  escanear la salida (`dist/|out/|_site/`) como HTML estático. Repo: `git clone --depth 1`.
- Un solo formato de `inventory.json` para ambas entradas; `source: {kind, origin, stack, detectedAt}`.

### 2 Auditoría (`audit.md`)
Secciones: resumen ejecutivo en lenguaje de cliente ("qué pierde hoy") · tabla de páginas con errores
(título/descr/canónica/H1/alt/JSON-LD) · enlaces rotos (4xx/5xx internos) · imágenes > 300 KB o sin
dimensiones · HTTPS/mixed content · Lighthouse móvil top 5 (perf/a11y/bp/seo + LCP/CLS) · robots/sitemap/IA
crawlers · duplicados (mismo `contentHash`) · stack detectado y riesgos. Cierra con "qué cambia con la migración".

### 3 Extracción
- **HTML → Markdown** sin dependencias: `html-to-md.mjs` (h1–h6, p, ul/ol, a, img, strong/em, blockquote,
  code/pre, tablas simples, br, hr). Elimina nav/header/footer/aside/script/style/form/iframe y bloques con
  clases `cookie|popup|modal|share|comments|sidebar`. Contenido principal: `<main>`, `<article>`, o el bloque
  con mayor densidad de texto.
- Frontmatter por archivo: `sourceUrl, title, description, type (page|post), date, author, tags, images[], confidence`.
- **brief.json** (schema `assets/brief.schema.json`, versión 1): mismos campos que el brief de `/new-website`
  (name, type, language, locale, adjectives, pages, contact{phone,email,address,openingHours}, social, domain,
  hosting, aiPolicy) + `brand{logo, colors[], fonts[]}` + `services[]` + `migration{inventoryCount, posts,
  redirectsPlanned}` + **`sources{campo: {from: url|file, confidence: high|medium|low}}`**. Nada inferido sin
  `confidence`; lo no encontrado es `null`.
- Heurísticas: NAP desde JSON-LD > `<address>` > footer > regex tel/email; horario desde JSON-LD
  `openingHoursSpecification` > texto "Lun–Vie"; servicios desde nav/`h2` de /servicios > tarjetas repetidas;
  marca: logo = `<img>` en header con `logo` en src/alt o `og:image`; colores = `<meta theme-color>` +
  colores más frecuentes en CSS (excluye blanco/negro/grises) → OKLCH; fuentes = `font-family` más usadas
  en h1/body (mapeo a `@fontsource-variable` si existe, si no `confidence: low`).
- Imágenes: descarga a `migration/assets/` (máx. 10 MB c/u), nombres slug, se referencian desde el Markdown.

### 4 Reconstrucción
`/new-website --from <brief.json>`: lee el brief, **no pregunta lo que tiene con `confidence: high`**, confirma en
una sola ronda lo `medium/low` y lo `null`, y pregunta solo: dirección de diseño (default "conservar marca,
rehacer layout") y qué páginas antiguas se descartan. Posts → `src/content/blog/<slug>.md` (schema de Astro
content collections ya presente en la plantilla). Páginas → `src/pages/<slug>.astro` usando `Section` y el
Markdown renderizado. Imágenes → `src/assets/migrated/`.

### 5 Redirects y paridad
`redirects.json`: `[{from: "/old-path", to: "/new-path/", status: 301, reason}]`. Reglas: misma ruta normalizada
→ sin redirect; slug cambiado → 301; página descartada → 301 a la página padre más cercana (o 410 si el usuario
lo pide). Genera bloque `redirects` en `vercel.json` y `public/_redirects` (Cloudflare). `check-redirects.mjs
<inventory> <dist> [--redirects vercel.json]`: para cada URL antigua, resuelve contra `dist/` + reglas → debe
terminar en un archivo existente; informe de huérfanas; exit 1 si hay alguna.

## Skill y comando
- `skills/migrate-site/SKILL.md` (Agent Skills): procedimiento fases 0–5, qué preguntar, cómo presentar
  `audit.md` al cliente, límites (sin carrito, sin login, sin formularios con backend), cuándo escalar.
- `commands/migrate-site.md`: argumentos, autorización, llama a los scripts, termina invocando `/new-website --from`.
- `references/migration.md`: doctrina (por qué 301 y paridad, qué se preserva del SEO, cómo tratar
  páginas basura, hreflang en sitios bilingües, Search Console "cambio de dirección").

## Pruebas (QA independiente)
- Fixtures en `evals/fixtures/`: `wp-like/` (HTML estático con estructura WordPress, 12 páginas, 30 posts,
  sitemap, JSON-LD parcial, 3 enlaces rotos, 1 duplicado) y `wp-export.xml` (WXR con 5 posts) y `spa-like/`
  (index.html + bundle que pinta contenido por JS).
- Tests Node (`node --test`) por script: inventario correcto (conteos), audit detecta los 3 rotos y el
  duplicado, extracción produce frontmatter + Markdown esperado (snapshots), brief válido contra schema con
  `sources`, redirects: 0 huérfanas en caso feliz y 1 detectada cuando se descarta una página.
- Eval real: `evals/cases/04-migracion.md` con un sitio real autorizado (el usuario elige) → resultado en `evals/results/`.

## Fuera de alcance
E-commerce con carrito, áreas con login, formularios con backend, idiomas distintos de es/en, sitios > 300
páginas (se avisa y se trunca), contenido tras paywall, scraping de terceros sin autorización.

## Riesgos
Sitios JS sin Playwright instalado → inventario parcial (avisado). Heurísticas de servicios/marca →
`confidence` explícita. Rate limits/WAF → backoff y aviso. Carpeta con secretos (`.env`) → nunca se copia; se
advierte.
