# Changelog

## 2.1.1 — 2026-10-13
Corrección encontrada en producción (eval `911locksmithassistance.com`, deploy real en Vercel vía Git):
- `templates/astro-marketing/vercel.json`: eliminadas las claves `_comment` y `_trailingSlash`. Vercel valida el
  archivo contra su esquema y **rechazaba el deploy** ("should NOT have additional property `_comment`").
  Los comentarios pasan a `references/deploy.md` §2.
- `init.sh`: nuevo gate "vercel.json sin claves extra" (también detecta rewrites SPA a `index.html`).

## 2.1.0 — 2026-10-08
Nuevo: migración de sitios existentes (WDK-007), spec en `docs/superpowers/specs/2026-10-08-migrate-site-design.md`.
- `/migrate-site` + skill `migrate-site`: fases 0–5 (autorización obligatoria, inventario, auditoría vendible,
  extracción, reconstrucción, redirects/paridad), límites y escalado.
- Scripts `skills/web-design-kit/scripts/migrate/` (Node 22 ESM, cero deps): `crawl-site` (robots.txt, sitemap,
  2 req/s, `--render` opcional), `scan-source` (carpeta, WXR, repo; nunca copia `.env*`/claves), `audit-site`
  (`audit.md` + `audit.json`, Lighthouse opcional), `extract-content` (Markdown con frontmatter, `assets/`,
  `brief.json` con `sources{campo:{from,confidence}}`), `plan-redirects` (`redirects.json`, merge en `vercel.json`,
  `public/_redirects`) y `check-redirects` (paridad contra `dist/`, exit 1 con huérfanas/bucles/conflictos).
- `assets/brief.schema.json` v1 + validador sin deps (`lib/brief.mjs`).
- Plantilla: colección `blog` (`src/content.config.ts`, `/blog/`, `/blog/[slug]/` con `Article` + `BreadcrumbList`,
  `noindex` sin posts), flag `showBlog` en `site.ts`; tests Playwright 26 → 32.
- `/new-website --from <brief.json>`: no repite lo `high`, una ronda para `medium/low/null`, posts a `src/content/blog/`.
- `references/migration.md`: 301 + paridad, qué SEO se preserva, páginas basura, hreflang es/en, Search Console.
- Eval `evals/cases/04-migracion.md`; fixtures `wp-like` (42 páginas), `wp-export.xml`, `spa-like`.
- 137 tests `node:test` (`init.sh` paso "Tests migrate"; job CI `migrate-tests`).

Correcciones tras la QA independiente (`evals/results/04-wp-like-2026-10-08.md`, mismo día; `fix(migrate): …`):
- `extract-content` escribe `content/blog/<slug>.md` (slug = último segmento de la URL: copiar a `src/content/blog/`
  sin renombrar conserva `/blog/<slug>/`) y `content/pages/<slug>.md`; frontmatter `path`; `brief.pages[]` con
  `path`/`targetPath`/`file`. Título sin sufijo " - Sitio", H1 duplicado fuera del cuerpo, enlaces internos relativos
  a la raíz, meta de WordPress (`entry-meta`/`entry-footer`) fuera del Markdown.
- `plan-redirects`: rutas sin mapping = sin cambios (`--strict` para exigirlas), `--brief` aplica `targetPath`.
  `check-redirects`: con `vercel.json` no evalúa conflictos (sin `reason`) y lo indica.
- `audit-site`: las URL 4xx/5xx no se auditan como páginas; `summary.pages` = páginas que responden,
  `inventoried`, `errorPages`, `brokenTargets`; resumen ejecutivo sin dobles conteos.
- Fixture `wp-like` con 9 archivos `/tag/`+`/author/` (51 páginas); `cases/04` realineado. Nuevo `test/e2e.test.mjs`
  (crawl → audit → extract → copiar posts → dist simulado → plan → check). 161 tests.

## 2.0.1 — 2026-10-08
Correcciones tras el primer eval real en Windows (`evals/results/02-havana-consulting-2026-10-08.md`).
- lighthouserc: sin `preset: 'mobile'` (inválido; móvil es el default), informes en `filesystem`, 404 evaluada sin categoría SEO (`assertMatrix`). Verificado: LHCI corre y pasa.
- SEO.astro: la canónica solo se omite en la 404, no en cualquier `noindex`.
- check-seo: `robots-disallow-all` evalúa por grupo de user-agent (falso positivo corregido).
- Tokens `--color-band`/`--color-band-ink` para `Section tone="ink"` (distinguible en modo oscuro).
- Skill: pregunta obligatoria de dirección física antes de emitir `LocalBusiness`; `ogLocale` por país.
- design-critique: nota `MSYS_NO_PATHCONV=1` para Git Bash en Windows.
- README: requisitos explícitos (CLI de Claude Code, Node ≥ 22.12, Git).

## 2.0.0 — 2026-10-07
Reescritura completa. El kit pasa de orquestador delgado (dependía de 3 skills externas y un MCP de pago)
a kit autocontenido.
- Nuevo: plantilla `templates/astro-marketing` (Astro 7.3.7, Tailwind 4.3.3, React 19.3 isla, Fonts API local,
  View Transitions, reveal por scroll con guardas, `<SEO>` + JSON-LD, robots con política IA, 404 real,
  cabeceras de seguridad, Cloudflare/Vercel, tests axe light+dark + SEO, Lighthouse 13 mobile).
- Nuevo: skills `web-design-kit` (router), `seo-audit`, `design-critique`; comando `/audit-site`.
- Nuevo: referencias con fecha de verificación: versions, design-anti-slop, tokens-dtcg, typography, motion,
  seo, a11y-eaa, quality-gates, deploy, stack-next.
- Nuevo: scripts `tokens-to-theme.mjs`, `check-seo.mjs`, `check-versions.mjs`; snippets `assets/motion/`.
- Nuevo: CI (validación de manifiestos/skills, build+tests de la plantilla, Lighthouse), evals, arnés
  (CLAUDE.md, init.sh, claude-progress.md, feature_list.json, DECISIONS.md).
- Retirado: skill `web-workflow`, stack Vite SPA + Tailwind 3 + react-router 6, SEO por `useEffect`,
  rewrite SPA en `vercel.json`, ruta local de Windows en la instalación.

## 1.0.0 — 2026-06-06
Primera versión: marketplace + plugin con `/new-website` (Vite SPA), MCP magic y skill `web-workflow`.
