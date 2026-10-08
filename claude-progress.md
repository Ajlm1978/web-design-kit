# claude-progress — web-design-kit

## Estado verificado (2026-10-08, sesión 2)
- Kit v2.1.0 en rama `feat/migrate-site` (WDK-007 passing, pendiente merge a `main` y eval real Task 9). Siguiente: eval `04-migracion.md` pasada B con sitio real autorizado (QA independiente) o WDK-003 (Next).

## Sesión 2 — 2026-10-08 (WDK-007: /migrate-site v2.1.0)
**Hecho**
- Spec + plan (`docs/superpowers/`). 6 scripts Node 22 ESM sin deps en `skills/web-design-kit/scripts/migrate/` + `lib/` (url, html, html-to-md, inventory, brand, brief, redirects) + `assets/brief.schema.json` v1.
- Fixtures `evals/fixtures/` (`wp-like` 42 páginas generado por `generate.mjs`, `wp-export.xml`, `spa-like`).
- Plantilla: colección `blog` + `/blog/`, `/blog/[slug]/`, `showBlog`; `/new-website --from brief.json`.
- Skill `migrate-site` (172 líneas, fases 0–5, pregunta de autorización literal), comando `/migrate-site`, `references/migration.md`, eval `04-migracion.md`.
- `init.sh` paso "Tests migrate", CI job `migrate-tests`, README/CHANGELOG/manifiestos 2.1.0, DECISIONS.

**Evidencia (resumida)**
- `node --test "…/migrate/test/*.test.mjs"`: 137 pass / 0 fail (26 suites).
- `scan-source` + `extract-content` sobre `wp-like`: 42 páginas, 30 posts, brief con 12 `sources` high / 2 medium, `validateBrief` OK.
- `./init.sh` completo: ver salida pegada en el commit `feat: /migrate-site v2.1.0 (WDK-007)` (astro check 0 err, build OK, check-seo 0 err, tokens OK, 32 tests Playwright, 137 tests migrate).
- `claude plugin validate .`: OK.

**Pendientes**
- Task 9: eval end-to-end por un agente QA que no construyó nada (fixture servido + sitio real autorizado) → `evals/results/04-*.md`.
- Merge `feat/migrate-site` → `main` tras el eval.
- Scripts no cubiertos por el plan: `--lang es|en` del spec no existe como flag (el idioma se detecta de `<html lang>`); `--lighthouse` solo con inventario de URL.
- Fixture `wp-like` referencia imágenes `wp-content/uploads/*.jpg` que no existen en disco (avisos en `extract-content --download-images`).

**Decisiones**: ver DECISIONS.md (sección 2026-10-08 — /migrate-site).

## Estado anterior (2026-10-08, sesión 1)
- Kit v2.0.1 en `main`. Eval WDK-002 PASA en Windows (ver evals/results/).

## Sesión 1 — 2026-10-08 (eval real + v2.0.1)
- Instalación desde GitHub en Windows OK (CLI 2.1.294). /new-website construyó Havana Consulting: 7 páginas, 50/50 tests, LH 99-100, auditores independientes.
- 10 hallazgos sobre el kit corregidos (ver CHANGELOG 2.0.1); LHCI verificado en vivo (perf 97-100 / a11y 100 / bp 100 / seo 100 en páginas indexables).
- `./init.sh` verde: check 0 err, build OK, check-seo 0 err, tokens OK, 26 tests.

## Estado anterior (2026-10-07)
- Kit v2.0.0 en rama `harness/2026-10-07`, listo para `main`.
- Gates: ver evidencia de la Sesión 0. Reproducir con `./init.sh`.
- Feature activa: ninguna (WDK-001 passing). Siguiente sugerida: WDK-006 (humano) y WDK-002.

## Sesión 0 — 2026-10-07 (arquitectura + arnés + v2.0.0)
**Hecho**
- Auditoría del repo original (1 commit, orquestador delgado, stack obsoleto) → ver DECISIONS.md.
- Investigación de estado del arte oct-2026 (frameworks, CSS, motion, SEO/GEO, a11y/EAA, Agent Skills, hosting) y verificación de versiones en npm en vivo.
- Equipo de 5 agentes en paralelo (template Astro, tokens/diseño, motion, SEO, calidad/CI) + corrección de 7 defectos hallados por los auditores.
- Plantilla `astro-marketing`, 3 skills, 2 comandos, 10 referencias, 3 scripts, snippets de motion, CI, evals, arnés.

**Evidencia (resumida)**
- `npm run check`: 0 errors/0 warnings (19 archivos) · `npm run build`: 3 páginas en ~1 s.
- `npm test`: 26 passed (axe light+dark × 375/768/1280 × 3 páginas; 8 SEO).
- `check-seo.mjs dist --site https://example.com`: 0 errores, 6 avisos (todos PLACEHOLDER esperados).
- `tokens-to-theme.mjs --check`: OK, idempotente; build con `@theme` generado OK.
- `check-versions.mjs`: 23 paquetes, 1 drift MAJOR intencional (TS).
- `claude plugin validate .`: passed.

**Pendientes**
- WDK-006: el humano debe rotar el PAT expuesto.
- WDK-002/003/004/005 en `feature_list.json`.
- Snippets `assets/motion/reveal.css` duplican selectores de `templates/.../motion.css`: no importar ambos (documentado en motion.md).

**Decisiones**: ver DECISIONS.md (sección 2026-10-07).
