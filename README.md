# Amilcar Web Kit — marketplace para Claude Code

Marketplace con el plugin **web-design-kit**: un flujo completo para disenar, previsualizar
y publicar sitios web con Claude Code (React + Vite + Tailwind + motion, deploy en Vercel),
con generacion de componentes UI via 21st.dev Magic.

## Instalacion

```bash
# 1. Agrega este marketplace (ruta local o repo git)
claude plugin marketplace add "C:/Users/amilc/OneDrive/Documents/Claude/Projects/web-design-kit"
# o, si lo subes a GitHub:
# claude plugin marketplace add tu-usuario/web-design-kit

# 2. Instala el plugin
claude plugin install web-design-kit@amilcar-web-kit
```

### Variable de entorno (MCP Magic)
El plugin declara el MCP de 21st.dev Magic, que requiere tu API key:

```powershell
setx MAGIC_API_KEY "tu_api_key_de_21st_dev"
```
(Reinicia la terminal/Claude Code para que tome la variable.)

### Companeros recomendados (no se duplican aqui para evitar conflictos)
Este kit **orquesta** estas skills; instalalas desde sus marketplaces:
- **project-core** — `project-kb` (memoria) + `golden-rules` (estandares). *(Autor: Amilcar Leong)*
- **ui-ux-pro-max** — sistema de diseno (estilos, paletas, tipografia). *(MIT)*

## Uso

```
/new-website "Mi Empresa" corporativo
```
Prepara el proyecto (tooling + KB + sistema de diseno) listo para construir, previsualizar
y desplegar. Luego la skill **web-workflow** guia la secuencia: KB -> design system ->
construir (con Magic) -> preview -> auditar -> deploy.

## Contenido del plugin

```
plugins/web-design-kit/
├── .claude-plugin/plugin.json   manifiesto
├── .mcp.json                    MCP magic (21st.dev) via MAGIC_API_KEY
├── commands/new-website.md      comando /new-website (scaffolding)
└── skills/web-workflow/         skill que orquesta el flujo end-to-end
```

## Notas
- Pensado para Windows + OneDrive (incluye el patron de junction para node_modules y el
  shim de python3), pero el flujo aplica en cualquier SO.
- Generado a partir de un proyecto real (sitio corporativo industrial). Licencia MIT.
