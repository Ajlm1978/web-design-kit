# claude-progress — web-design-kit

## Sesión 5 — 2026-10-13/14 (pasada B real: 911locksmithassistance.com, v2.1.1)
**Hecho**
- Rebuild Astro del sitio real (SPA React/Vite → Astro) en repo del usuario, PR #1 mergeado, producción en Vercel: home 200, robots 200, sitemap-index 200, `/loquesea/` 404 real, canonical OK.
- Bug propio encontrado en despliegue real: `vercel.json` de la plantilla con `_comment`/`_trailingSlash` → Vercel rechaza ("should NOT have additional property"). Corregido en v2.1.1 (`3b9d721`) + gate en `init.sh` (verificado: detecta el archivo viejo, pasa con el nuevo).
- Lecciones de producción a `references/deploy.md` §2 y §3: Hobby + repo privado exige autor de commit = dueño (typo de email en git → `BLOCKED`), conectar Git, `www`/apex en proveedores distintos (dos sitios vivos, Google eligió el viejo), orden de cambio de DNS, sitemap con URL completa en propiedad Dominio.

**Evidencia**: `curl -I` a www → 308 → apex `server: Vercel`; Vercel `misconfigured:false`; ambos dominios "Valid Configuration".

**Pendientes (WDK nuevos, de esta pasada)**
- Error mío: la descripción del PR decía "JSON-LD LocalBusiness" sin comprobarlo; en vivo es Organization/WebSite/ContactPoint/OpeningHours **sin `areaServed`** (falta para negocios de zona de servicio). Plantilla/`jsonld.ts`: emitir `areaServed` cuando no hay dirección.
- Claims sin respaldo publicados (500+, 5★, 0 quejas, 100 %, 2+ años, 15 min, "licenciado y asegurado"): decisión del dueño pendiente.
- `check-seo`/crawl: falso positivo robots/sitemap en SPAs que devuelven HTML 200; auto `--render` en js-only; `DEP0190` (`shell:true`) en audit-site; `extract-content` crash al salir en Windows; `plan-redirects` no debe escribir `_redirects` en Vercel ni `redirects: []` vacío; `PW_PORT`/puerto libre en Playwright de la plantilla; `--into <repo>`; documentar permiso "read outside working dir".
- Search Console: pedir indexación de la raíz tras arreglar `www` (hecho el DNS 2026-10-14), sitemap completo, Bing import; despublicar el proyecto Lovable.
- Actualizar el doc del Project a v2.1.1; WDK-003 (Next 16.4), WDK-004/005/008.

## Estado verificado (2026-10-08, sesión 4)
- Kit v2.1.0 en rama `feat/migrate-site`: QA pasada 2 con build Astro real (`evals/results/04-wp-like-2026-10-08-pass2.md`) dio PASA CON HALLAZGOS; corregidos los 4 medios (H2-01..H2-04) + H2-07 + H-11 con TDD (commit `667d0cb`). Tests migrate 172/172, `./init.sh` verde. Siguiente: pasada B (sitio real) por otra sesión QA; cerrar bajos H2-05/H2-06 si sobra; merge a `main`.

## Sesión 4 — 2026-10-08 (correcciones QA pasada 2, WDK-007)
**Hecho**
- H2-01: `extract-content` convierte en texto los enlaces hacia destinos rotos del sitio viejo (criterio de `findBrokenLinks`) y avisa `Enlace roto eliminado: <desde> → <hacia>`; `check-seo` gana el error `link-broken` (todo `<a href="/…">` debe existir en `dist/` o ser origen de un redirect con `--redirects <redirects.json|vercel.json>`).
- H2-02: `planRedirects` honra claves del mapping que están en `inventory.skipped` (redirect + `notes[]`) y avisa (no fatal) de claves que no están en el inventario (`warnings[]`, impresas por la CLI).
- H2-03 + H-11: `parseSitemap` → `otherHosts[]`; sitemap con 0 URL del origen → `inventory.warnings[]` con el host sugerido; `warnings: []` siempre presente en el inventario del crawl; CLI `Avisos: N`.
- H2-04: `audit.md` duplicados "se conserva una y las demás redirigen a ella (se decide en `mapping.json`)"; promesa "Cero enlaces rotos" alineada con lo que hace el flujo.
- H2-07: `migrate-site/SKILL.md` exige `--site` = `SITE.url` = dominio de producción (pedirlo si `brief.domain` es null) y sugiere `--redirects`; docs `quality-gates.md`, `seo.md`, `migration.md`, README.
- Sección "7. Correcciones aplicadas" en `evals/results/04-wp-like-2026-10-08-pass2.md`.

**Evidencia (resumida)**
- `node --test "…/migrate/test/*.test.mjs"`: 172 pass / 0 fail (13 en rojo antes de implementar; 161 → 172).
- `./init.sh`: astro check 0 err · build OK · check-seo 0 err (8 avisos PLACEHOLDER) · 32 Playwright · OK — kit verificado 2026-10-08T22:42Z.

**Pendientes**
- QA pasada B con sitio real (maker ≠ checker); merge a `main`.
- Abiertos: H2-05, H2-06, H2-08, H2-09, H-07 (imágenes absolutas), H-08, H-12, H-13, H-14, H-15, H-17, H-18.

## Estado anterior (2026-10-08, sesión 3)
- Kit v2.1.0 en rama `feat/migrate-site`: QA independiente (`evals/results/04-wp-like-2026-10-08.md`) dio NO PASA (H-01 bloqueante); corregidos H-01..H-07, H-10, H-16 (+ parte de H-14) con TDD. Tests migrate 161/161, `./init.sh` verde, `claude plugin validate` OK.

## Sesión 3 — 2026-10-08 (correcciones QA WDK-007)
**Hecho**
- H-10: fixture `wp-like` con 9 archivos `/tag/`+`/author/` (51 páginas; URL 50×200 + 3×404); conteos de tests y `cases/04` realineados.
- H-01 (bloqueante): `extract-content` → `content/blog/<último-segmento>.md` + `content/pages/<slug>.md`; frontmatter `path`; `brief.pages[]` con `path`/`targetPath`/`file`; `plan-redirects --brief`. Posts conservan `/blog/<slug>/`.
- H-02/H-06/H-07: H1 duplicado fuera del cuerpo, título sin sufijo del sitio, enlaces internos relativos a la raíz, meta de WP (`entry-meta`/`entry-footer`) fuera del Markdown.
- H-03/H-04: rutas sin mapping = sin cambios (`--strict` opcional); `check-redirects` con `vercel.json` no evalúa conflictos (sin `reason`) y lo dice.
- H-05: `audit.md` sin dobles conteos (`summary.pages` = páginas que responden, `inventoried`, `errorPages`, `brokenTargets`).
- Nuevo `test/e2e.test.mjs` (crawl→audit→extract→copiar posts→dist simulado→plan→check): falla en el código previo, pasa ahora.
- Docs: `migrate-site/SKILL.md`, `commands/new-website.md`, `commands/migrate-site.md`, spec, `migration.md`, `brief.schema.json`; sección "Correcciones aplicadas" en el informe QA.

**Evidencia (resumida)**
- `node --test "…/migrate/test/*.test.mjs"`: 161 pass / 0 fail (antes 137).
- `./init.sh`: astro check 0 err · build OK · check-seo 0 err · tokens OK · 32 Playwright · OK — kit verificado 2026-10-08T22:11Z.
- `claude plugin validate .`: passed.

**Pendientes**
- QA pasada A completa con build Astro real (maker ≠ checker) y pasada B; merge a `main`.
- Hallazgos abiertos: H-08 (WXR `<channel>`/display name), H-09 (regla única para `/privado/` y 404 en paridad), H-11, H-12, H-13, H-14 (frase alt), H-15, H-17, H-18; imágenes no descargadas siguen absolutas (H-07 parcial).

**Decisiones**: ver DECISIONS.md (sección 2026-10-08 — correcciones QA).

## Sesión 2 — 2026-10-08 (WDK-007: /migrate-site v2.1.0)
**Hecho**
- Spec + plan (`docs/superpowers/`). 6 scripts Node 22 ESM sin deps en `skills/web-design-kit/scripts/migrate/` + `lib/` (url, html, html-to-md, inventory, brand, brief, redirects) + `assets/brief.schema.json` v1.
- Fixtures `evals/fixtures/` (`wp-like` 42 páginas —51 desde la sesión 3— generado por `generate.mjs`, `wp-export.xml`, `spa-like`).
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
