# /migrate-site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar un sitio existente (URL, carpeta o repo), extraer su contenido real a Markdown + `brief.json`, y reconstruirlo con el kit sin perder URLs.

**Architecture:** Cinco scripts Node 22 ESM sin dependencias (`crawl-site`, `scan-source`, `audit-site`, `extract-content`, `check-redirects`) más una librería compartida (`lib/html.mjs`, `lib/html-to-md.mjs`, `lib/url.mjs`), todos bajo `plugins/web-design-kit/skills/web-design-kit/scripts/migrate/`. Una skill `migrate-site` y un comando orquestan; `/new-website` gana `--from brief.json`. Tests con `node --test` sobre fixtures en `evals/fixtures/`.

**Tech Stack:** Node 22 (fetch nativo, `node:test`), Playwright opcional para render, Astro 7 template existente.

**Spec:** `docs/superpowers/specs/2026-10-08-migrate-site-design.md`

## Global Constraints
- Scripts: Node ≥ 22, ESM, **cero dependencias npm**; `node --check` limpio; prosa/mensajes en español, identificadores en inglés.
- Crawler: UA `web-design-kit-migrate/1.0`, respeta `robots.txt` Disallow, 2 req/s, timeout 15 s, `--max-pages` default 300, mismo origen.
- Nada inferido sin `confidence`; lo no encontrado es `null`. Nunca copiar `.env*` ni credenciales de carpetas/repos.
- Un solo formato `inventory.json` para URL y dir/repo (`source.kind: url|dir|repo`).
- `brief.json` valida contra `assets/brief.schema.json` v1.
- Cada script: `--help`, `--json`, exit 1 en error fatal, 0 en informativo.
- Windows + Git Bash: rutas pasadas como argumentos sin barra inicial o con `MSYS_NO_PATHCONV=1` (documentar).

## Review Focus
1. URL con `robots.txt` que bloquea todo (`Disallow: /`) → el crawler no rastrea, explica por qué, exit 1. (Task 2)
2. Página que redirige fuera del dominio (301 a facebook) → se registra `status/finalUrl`, no se sigue. (Task 2)
3. HTML sin `<main>` ni `<article>` → el extractor elige el bloque de mayor densidad de texto y lo marca `confidence: medium`. (Task 5)
4. Dos páginas antiguas que mapean al mismo slug nuevo → `check-redirects` lo detecta como conflicto, exit 1. (Task 7)
5. WXR con posts en `draft`/`private` → se excluyen del inventario y se cuentan en `skipped`. (Task 3)

---

### Task 1: Fixtures y librería compartida

**Files:**
- Create: `evals/fixtures/wp-like/` (12 páginas HTML + 30 posts en `/blog/<slug>/index.html`, `sitemap.xml`, `robots.txt`, 3 enlaces rotos, 1 página duplicada, JSON-LD LocalBusiness en `/contacto/`, `<meta theme-color>`, CSS con 2 colores dominantes y `font-family`), `evals/fixtures/wp-export.xml` (WXR, 5 posts: 3 publish, 1 draft, 1 private), `evals/fixtures/spa-like/index.html` (+ `app.js` que inyecta contenido), `evals/fixtures/generate.mjs` (genera wp-like determinísticamente).
- Create: `plugins/web-design-kit/skills/web-design-kit/scripts/migrate/lib/url.mjs`, `lib/html.mjs`, `lib/html-to-md.mjs`
- Test: `plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/lib.test.mjs`

**Interfaces (Produces):**
- `url.mjs`: `normalizeUrl(href: string, base: string): string|null` (quita fragmento, utm_*, fuerza barra final en rutas sin extensión; null si otro origen o no-http), `sameOrigin(a,b): boolean`, `slugFromPath(path: string): string`.
- `html.mjs`: `parseHead(html): {title, description, canonical, robots, lang, ogImage, themeColor, jsonld: object[]}`, `extractLinks(html, base): string[]`, `extractImages(html, base): {src, alt, width, height}[]`, `mainContent(html): {html: string, confidence: 'high'|'medium'}` (main/article → high; densidad → medium), `textOf(html): string`, `wordCount(text): number`, `contentHash(text): string` (sha1 de texto normalizado).
- `html-to-md.mjs`: `htmlToMarkdown(html: string, {baseUrl}): string` (h1–h6, p, ul/ol, a, img, strong/em, blockquote, pre/code, tablas simples, br, hr; elimina nav/header/footer/aside/script/style/form/iframe y clases `cookie|popup|modal|share|comments|sidebar`).

- [ ] Step 1: escribir `generate.mjs` y generar `wp-like` (determinista, sin fechas actuales). Verificar: `find evals/fixtures/wp-like -name index.html | wc -l` = 42 (12 páginas + 30 posts).
- [ ] Step 2: test `lib.test.mjs`: `normalizeUrl('/a#x?utm_source=1','https://s.com')==='https://s.com/a/'`; `normalizeUrl('https://other.com/','https://s.com')===null`; `parseHead` de `wp-like/contacto/index.html` devuelve `jsonld[0]['@type']==='LocalBusiness'`; `mainContent` de una página sin `<main>` → `confidence==='medium'`; `htmlToMarkdown('<h2>A</h2><ul><li>x</li></ul><p>b <a href="/c/">c</a></p>')` === `'## A\n\n- x\n\nb [c](https://s.com/c/)\n'` con `baseUrl` `https://s.com`.
- [ ] Step 3: correr `node --test scripts/migrate/test/` → FAIL. Implementar. Correr → PASS.
- [ ] Step 4: commit `feat(migrate): fixtures y lib compartida (WDK-007)`.

### Task 2: `crawl-site.mjs`

**Files:** Create `scripts/migrate/crawl-site.mjs`; Test `test/crawl.test.mjs` (sirve `wp-like` con `node:http` en puerto libre).

**Interfaces (Produces):** CLI `node crawl-site.mjs <url> --out <dir> [--max-pages 300] [--render]` → escribe `<out>/inventory.json` y `<out>/raw/<sha1(url)>.html`. Exporta `crawl(startUrl, opts): Promise<Inventory>`.
`Inventory = {version:1, source:{kind:'url', origin, stack:null, detectedAt}, pages: Page[], skipped: {url, reason}[], stats:{fetched, errors, durationMs}}`; `Page = {url, status, finalUrl, title, description, canonical, h1, lang, wordCount, links[], images[], jsonld[], contentHash, rawFile, rendered:boolean}`.

- [ ] Step 1: tests: rastrea fixture servida → `pages.length===42`, los 3 rotos aparecen con `status 404`, página duplicada comparte `contentHash`, enlace externo no está en `pages`, `skipped` incluye `{reason:'robots'}` para `/privado/` (fixture lo bloquea), y con `robots.txt` `Disallow: /` (segundo servidor) → rechaza con exit 1 / lanza `RobotsBlockedError`.
- [ ] Step 2: FAIL → implementar (BFS, cola, rate limit 500 ms, `AbortSignal.timeout(15000)`, sitemap seed, detección JS-only → si `--render` y Playwright resoluble, renderizar; si no, `skipped.reason='js-only'`).
- [ ] Step 3: PASS → commit `feat(migrate): crawl-site`.

### Task 3: `scan-source.mjs`

**Files:** Create `scripts/migrate/scan-source.mjs`; Test `test/scan.test.mjs`.

**Interfaces (Produces):** CLI `node scan-source.mjs <dir|repoUrl> --out <dir> [--build]` → mismo `Inventory` con `source.kind:'dir'|'repo'`, `source.stack: 'wxr'|'wordpress'|'static'|'astro'|'next'|'hugo'|'jekyll'|'spa'|'unknown'`. Para WXR: `Page.type:'page'|'post'`, `date`, `author`, `tags`, y el HTML del `<content:encoded>` guardado en `raw/`. Repo: `git clone --depth 1` a un tmp.

- [ ] Step 1: tests: `scan(fixtures/wp-like)` → stack `static`, 42 páginas; `scan(fixtures/wp-export.xml)` → stack `wxr`, 3 páginas, `skipped` 2 con `reason:'draft'|'private'`; carpeta con `.env` → nunca aparece en `raw/` y hay `warnings[0]` mencionando `.env`.
- [ ] Step 2: FAIL → implementar. Step 3: PASS → commit `feat(migrate): scan-source`.

### Task 4: `audit-site.mjs`

**Files:** Create `scripts/migrate/audit-site.mjs`; Modify `scripts/check-seo.mjs` (exportar `auditHtml(html, {url, site})` reutilizable sin romper la CLI); Test `test/audit.test.mjs`.

**Interfaces (Produces):** CLI `node audit-site.mjs <inventory.json> --out <dir> [--lighthouse]` → `audit.md` + `audit.json {summary:{pages, errors, warnings, broken, duplicates, heavyImages}, pages:[...], lighthouse?:[...]}`. Secciones de `audit.md` exactamente las del spec §2.

- [ ] Step 1: tests sobre inventario del fixture: `audit.json.summary.broken===3`, `duplicates===1`, `audit.md` contiene `## Resumen ejecutivo` y `## Enlaces rotos`.
- [ ] Step 2: FAIL → implementar (Lighthouse solo con `--lighthouse` y si `npx lighthouse` disponible; top 5 por enlaces entrantes). Step 3: PASS → commit `feat(migrate): audit-site`.

### Task 5: `extract-content.mjs` + `brief.schema.json`

**Files:** Create `scripts/migrate/extract-content.mjs`, `skills/web-design-kit/assets/brief.schema.json`, `scripts/migrate/lib/brief.mjs`; Test `test/extract.test.mjs`.

**Interfaces (Produces):** CLI `node extract-content.mjs <inventory.json> --out <dir> [--download-images]` → `content/<slug>.md` (frontmatter del spec §3), `assets/` (imágenes), `brief.json`. `lib/brief.mjs`: `validateBrief(obj): {ok, errors[]}` (validador mínimo del schema v1: required, types, enums; sin deps). Brief v1 campos: `version, name, type, language, locale, adjectives[], pages[], contact{phone,email,address,openingHours[]}, social{}, domain, hosting, aiPolicy, brand{logo,colors[],fonts[]}, services[{title,summary}], migration{inventoryCount,posts,redirectsPlanned}, sources{<path>:{from,confidence}}`.

- [ ] Step 1: tests: 42 archivos en `content/`, el de `/contacto/` tiene `type: page`, posts tienen `type: post` y `date`; `brief.contact.phone` sale del JSON-LD con `sources['contact.phone'].confidence==='high'`; `brief.brand.colors` incluye el `theme-color` del fixture; página sin `<main>` → frontmatter `confidence: medium`; `validateBrief(brief).ok===true`; `validateBrief({})` lista `name` en errores.
- [ ] Step 2: FAIL → implementar (heurísticas del spec §3 en orden de prioridad; mapeo de fuentes a `@fontsource-variable` con lista fija de 40 familias conocidas, si no → `confidence:'low'`). Step 3: PASS → commit `feat(migrate): extract-content + brief schema`.

### Task 6: `/new-website --from brief.json` y blog collection

**Files:** Modify `commands/new-website.md`, `skills/web-design-kit/SKILL.md` (paso 0: si hay `--from`, no preguntar lo `high`), Template: Create `templates/astro-marketing/src/content.config.ts` (collection `blog` con schema title/description/date/author/tags/draft/sourceUrl), `src/pages/blog/index.astro`, `src/pages/blog/[slug].astro`, `src/content/blog/.gitkeep`; Modify `astro.config.mjs` sitemap filter (excluir `/blog/` si no hay posts); Test: `templates/astro-marketing/tests/blog.spec.ts`.

- [ ] Step 1: test Playwright: con un post de prueba en `src/content/blog/ejemplo.md` (creado por el test en `beforeAll`, borrado en `afterAll`), `/blog/` lista el título y `/blog/ejemplo/` tiene `Article` JSON-LD y canónica. Sin posts, `/blog/` responde 200 con `noindex`.
- [ ] Step 2: FAIL → implementar. Step 3: `npm test` 28+ verdes → commit `feat(template): blog collection + /new-website --from`.

### Task 7: `check-redirects.mjs` + generación de redirects

**Files:** Create `scripts/migrate/check-redirects.mjs`, `scripts/migrate/plan-redirects.mjs`; Test `test/redirects.test.mjs`.

**Interfaces (Produces):** `plan-redirects.mjs <inventory.json> <mapping.json> --out <dir>` → `redirects.json [{from,to,status,reason}]` + bloque `redirects` en `vercel.json` (merge, no sobrescribe cabeceras) + `public/_redirects`. `mapping.json` lo escribe el agente: `{ "/old/": "/new/" | null }` (null = descartada → 301 al padre). `check-redirects.mjs <inventory.json> <dist> --redirects redirects.json` → exit 1 si alguna URL antigua no termina en archivo de `dist/`; detecta dos `from` distintos → mismo `to` con `reason` ausente como conflicto.

- [ ] Step 1: tests: caso feliz 0 huérfanas; una página descartada → redirect al padre y 0 huérfanas; mapping con dos orígenes al mismo destino sin reason → exit 1 "conflicto".
- [ ] Step 2: FAIL → implementar. Step 3: PASS → commit `feat(migrate): redirects + paridad`.

### Task 8: skill, comando, referencia, docs del kit

**Files:** Create `skills/migrate-site/SKILL.md`, `commands/migrate-site.md`, `skills/web-design-kit/references/migration.md`, `evals/cases/04-migracion.md`; Modify `README.md`, `CHANGELOG.md` (2.1.0), `plugin.json` (2.1.0), `init.sh` (añadir `node --test scripts/migrate/test/`), `.github/workflows/ci.yml` (job `migrate-tests`), `feature_list.json`.

- [ ] Step 1: SKILL.md con frontmatter válido (name = carpeta), fases 0–5, pregunta de autorización literal, límites, escalado; comando con argumentos y orden de scripts.
- [ ] Step 2: `./init.sh` verde incluyendo los tests de migrate; `claude plugin validate .` OK; commit `feat: /migrate-site v2.1.0 (WDK-007)`.

### Task 9: Eval end-to-end (QA independiente)

- [ ] Step 1: agente QA que no construyó nada: sirve `wp-like`, corre `crawl → audit → extract → plan-redirects` por CLI, construye un proyecto desde el brief con la plantilla, corre `check-redirects` contra `dist/`. Reporta conteos y defectos en `evals/results/04-wp-like-<fecha>.md`.
- [ ] Step 2: corregir defectos; re-ejecutar; commit.
