# web-design-kit

Plugin de Claude Code para disenar sitios web profesionales.

## Que aporta
- **Comando `/new-website`** — prepara un proyecto React + Vite + Tailwind + motion con
  tooling listo: `.gitignore`, `.gitattributes`, `vercel.json` (rewrite SPA),
  `.claude/launch.json` (preview), helper de node_modules fuera de OneDrive, y `CLAUDE.md`.
- **MCP `magic` (21st.dev)** — generar/refinar componentes UI (`21st_magic_component_builder`,
  `_refiner`, `_inspiration`) y buscar logos (`logo_search`). Requiere `MAGIC_API_KEY`.
- **Skill `web-workflow`** — orquesta la secuencia: KB -> sistema de diseno -> construir ->
  preview -> auditar (Golden Rules) -> deploy (Vercel).

## Requisitos
- Variable de entorno `MAGIC_API_KEY` (key de 21st.dev) para el MCP magic.
- Companeros recomendados: `project-core` (project-kb + golden-rules) y `ui-ux-pro-max`.

## Buenas practicas que codifica
- Adaptar el output de Magic al design system (no pegar crudo: viene en Next/TS/shadcn).
- Legibilidad de titulos sobre fondos oscuros; navbar adaptativo sobre hero oscuro.
- Datos reales vs placeholder (no inventar); optimizar imagenes; SEO por ruta en SPA.
- En OneDrive: node_modules via junction (`npm run deps`, no `npm install`).

Licencia: MIT.
