# web-design-kit — guía para agentes (router)

Repositorio público: marketplace de Claude Code + Agent Skill para construir sitios web profesionales.
No es un sitio: es el **kit** (plantilla, skills, scripts, docs). Leer esto primero; cargar lo demás bajo demanda.

## Qué es y cómo se organiza
- `.claude-plugin/marketplace.json` → plugin `plugins/web-design-kit/` (`plugin.json`, `commands/`, `skills/`, `templates/`).
- Skill principal: `plugins/web-design-kit/skills/web-design-kit/SKILL.md` (router) + `references/` (doctrina con fecha) + `scripts/` (Node 22 ESM, cero deps) + `assets/` (tokens, motion).
- Plantilla real: `plugins/web-design-kit/templates/astro-marketing/` (Astro 7 + Tailwind 4; la única pieza con `package.json`).
- Arnés: `init.sh` (verifica), `claude-progress.md` (estado entre sesiones), `feature_list.json` (tajada activa, WIP=1), `DECISIONS.md` (por qué).
- Stack de la plantilla (fuente: `templates/astro-marketing/package.json` + `references/versions.md`): astro 7.3.7, tailwindcss 4.3.3, react 19.3.0, motion 14.0.0, typescript 5.9.3 (pin por `@astrojs/check`), playwright 1.64, axe 4.13. Node ≥ 22.12.

## Quick start (sesión nueva)
```bash
./init.sh            # instala plantilla (sin scripts), astro check, build, tests, check-seo, validate plugin
cat claude-progress.md | head -60
```
Red del sandbox: solo registro npm (+ CDN de Playwright). `npm create astro`/descargas de GitHub fallan: por eso la plantilla se copia, no se descarga.

## Reglas
1. **WIP = 1.** Una feature `in_progress` en `feature_list.json`; la siguiente solo cuando la anterior cumple su `verification`.
2. **Definition of Done** = `./init.sh` verde + la verificación propia de la feature + `claude-progress.md` actualizado. Nunca `passing` sin evidencia ejecutada.
3. **Maker ≠ checker.** Cambios en la plantilla los audita otra sesión con `/audit-site` o las skills `seo-audit`/`design-critique`.
4. **Versiones solo desde `references/versions.md`** (con fecha). Si cambias una, corre `scripts/check-versions.mjs` y actualiza la fecha.
5. **Sin datos inventados** en plantilla ni docs: `PLACEHOLDER` explícito.
6. **No sobreescribir**: `test -e` antes de crear; `CLAUDE.md` de la plantilla es independiente de este.
7. **Nunca** tokens/secretos en el repo, commits o docs. `.mcp.json` solo usa `${MAGIC_API_KEY}`.
8. Cada `SKILL.md` cumple el estándar Agent Skills: `name` = carpeta, `description` dice qué y cuándo, cuerpo < ~5 000 tokens, detalle en `references/`.
9. Idioma: prosa en español, identificadores en inglés.
10. Commits: `tipo(ámbito): resumen` + id de feature; la plantilla debe seguir verde tras cada commit.

## Cierre de sesión
Actualiza `claude-progress.md` (hecho · evidencia resumida · pendientes · decisiones) y `feature_list.json`; anota decisiones no triviales en `DECISIONS.md`; deja `git status` limpio o explica qué queda sin commitear.
