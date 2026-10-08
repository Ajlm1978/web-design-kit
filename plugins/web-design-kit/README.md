# web-design-kit (plugin)

Ver el [README del repositorio](../../README.md). Estructura:

```
plugins/web-design-kit/
├── .claude-plugin/plugin.json
├── .mcp.json                      MCP magic (21st.dev), opcional, via MAGIC_API_KEY
├── commands/new-website.md        scaffold + flujo completo
├── commands/audit-site.md         gates como checker
├── commands/migrate-site.md       sitio existente → kit, con redirects 301 y paridad
├── skills/web-design-kit/         SKILL.md router + references/ + scripts/ + assets/
│   └── scripts/migrate/           crawl-site, scan-source, audit-site, extract-content, plan-redirects, check-redirects (+ lib/, test/)
├── skills/seo-audit/
├── skills/design-critique/
├── skills/migrate-site/           fases 0–5 de la migración (autorización → paridad)
└── templates/astro-marketing/     proyecto Astro 7 verificado (build, tests, SEO)
```
