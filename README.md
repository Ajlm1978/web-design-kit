# web-design-kit — sitios web profesionales con Claude Code

Kit público (marketplace + Agent Skill) para construir sitios web **impecables en 2026**: diseño con
criterio (no "plantilla de IA"), SEO que funciona en Google y en buscadores con IA, animaciones que no
castigan el rendimiento, accesibilidad WCAG 2.2 AA y deploy a coste cero.

**Estado: v2.0.0 — plantilla y gates verificados el 2026-10-07** (build 1 s, `astro check` 0 errores,
26 tests Playwright + axe en verde, `check-seo` 0 errores). Versiones y fecha en
[`versions.md`](plugins/web-design-kit/skills/web-design-kit/references/versions.md).

## Qué trae
| Pieza | Qué hace |
|---|---|
| `templates/astro-marketing/` | Proyecto Astro 7.3 + Tailwind 4.3 + isla React 19.3 listo: `<SEO>` tipado, JSON-LD, robots con política de crawlers IA, sitemap, fuentes locales (Fonts API), View Transitions, reveal por scroll con guardas, 404 real, cabeceras de seguridad, `wrangler.jsonc` + `vercel.json`, tests axe (light+dark, 3 viewports) y SEO, Lighthouse CI |
| Skill `web-design-kit` | El flujo completo brief → tokens → construir → verificar → deploy, con referencias cargadas bajo demanda |
| Skill `seo-audit` | Auditoría SEO técnica de un `dist/` como checker independiente |
| Skill `design-critique` | Crítica visual con rúbrica anti-slop de 10 puntos y capturas light/dark |
| `scripts/tokens-to-theme.mjs` | Tokens DTCG 2025.10 (`tokens.json`, OKLCH, modos) → bloque `@theme` de Tailwind 4 |
| `scripts/check-seo.mjs` | Valida títulos, descripciones, canónicas, OG, JSON-LD, imagen LCP, robots, sitemap, 404 |
| `scripts/check-versions.mjs` | Detecta drift de versiones contra npm |
| `assets/motion/` | Snippets listos: reveal CSS, view transitions, `@starting-style`, isla `motion` v14, GSAP scrollytelling, Lenis opt-in |
| Comandos | `/new-website`, `/audit-site` |
| `evals/` | 3 casos (corporativo industrial, restaurante local, portfolio) con criterios de aprobación |

## Instalación

**Claude Code (marketplace):**
```bash
claude plugin marketplace add Ajlm1978/web-design-kit
claude plugin install web-design-kit@amilcar-web-kit
```

**Como Agent Skill (cualquier agente compatible con SKILL.md):**
```bash
npx skills add Ajlm1978/web-design-kit --skill web-design-kit
```

Opcional: MCP `magic` (21st.dev) para inspiración de componentes — `MAGIC_API_KEY` en el entorno.
No es dependencia.

## Uso
```
/new-website "Taller Mendoza" corporativo
```
El agente pregunta el brief una sola vez, copia la plantilla, deriva tokens de la marca, construye,
corre los gates y entrega con evidencia. Para auditar un sitio existente: `/audit-site ./dist --site https://…`.

## Decisiones de arquitectura (resumen)
- **Astro estático por defecto**: los crawlers de IA no ejecutan JS y Google exige páginas indexables;
  un SPA React no cumple. Next.js 16.4 solo para apps/dashboards (`references/stack-next.md`).
- **Tailwind 4 CSS-first** con tokens en OKLCH y `light-dark()`; sin `tailwind.config.js`.
- **Motion CSS-first**: `@starting-style`, View Transitions, scroll-driven con `@supports`; `motion`
  v14 en islas; GSAP (gratis) y Lenis solo opt-in.
- **Sin rewrite SPA** en hosting (genera soft-404). Cloudflare Workers Static Assets recomendado.
- **Maker ≠ checker**: las auditorías las hace otra sesión.

Detalle y motivos: [`DECISIONS.md`](DECISIONS.md). Cambios por versión: [`CHANGELOG.md`](CHANGELOG.md).

## Desarrollo del kit
`./init.sh` instala y verifica la plantilla (gates completos). Memoria de sesiones en
`claude-progress.md`; tajada de trabajo activa en `feature_list.json`. CI en `.github/workflows/ci.yml`.

Licencia MIT.
