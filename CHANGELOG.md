# Changelog

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
