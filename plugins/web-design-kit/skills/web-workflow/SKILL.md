---
name: web-workflow
description: |
  Flujo de trabajo end-to-end para disenar y publicar sitios web con Claude Code.
  Orquesta los recursos del ecosistema: Project KB (memoria persistente), Golden Rules
  (estandares production-grade), UI/UX Pro Max (sistema de diseno) y 21st.dev Magic
  (generacion de componentes UI). Usar al iniciar o trabajar en cualquier proyecto de
  sitio web: landing page, corporativo, dashboard, portfolio, e-commerce o SaaS.
  Disparadores: "nueva web", "disenar el sitio", "landing", "componente UI", "preview
  del sitio", "deploy", "mejorar el diseno".
---

# Web Workflow — flujo de diseno de sitios web

Esta skill define el orden y los recursos para llevar un sitio web de cero a publicado
con calidad production-grade. No reimplementa lo que ya hacen otras skills: las
**orquesta**.

## Recursos del ecosistema (instalar como companeros)

| Recurso | Para que | Como |
|---|---|---|
| **project-kb** (skill) | Memoria viva: decisiones, configuraciones, errores, sesiones | `docs/kb/` |
| **golden-rules** (skill) | Estandares: causa raiz, no inventar datos, auditar antes de "listo" | verificacion pre-accion |
| **ui-ux-pro-max** (skill) | Sistema de diseno: estilo, paleta, tipografia, UX | `--design-system` |
| **magic** (MCP, 21st.dev) | Generar/refinar componentes UI; buscar logos | `21st_magic_component_builder`, `logo_search` |
| **/new-website** (comando) | Scaffolding de proyecto listo para preview + deploy | en este plugin |

> Companeros recomendados: instala `project-core` (project-kb + golden-rules) y
> `ui-ux-pro-max` desde sus marketplaces. El MCP `magic` viene declarado en este plugin
> (requiere la variable de entorno `MAGIC_API_KEY`).

## Secuencia logica

1. **Iniciar / KB** — Si el proyecto ya tiene `docs/kb/`, leer PROJECT.md + ultimas
   sesiones antes de actuar (protocolo project-kb). Si es nuevo, correr `/new-website`.
2. **Sistema de diseno** — Antes de escribir UI, obtener recomendaciones con
   `ui-ux-pro-max --design-system "<tipo de producto> <industria> <keywords>"`
   (estilo, paleta, tipografia, anti-patrones). Persistir en `docs/kb/ARCHITECTURE.md`.
3. **Construir** — Implementar paginas y componentes en el stack del proyecto
   (React + Vite + Tailwind + motion). Para componentes nuevos o refinamientos, usar
   `magic` como referencia y **adaptar al design system** (no pegar output crudo: suele
   venir en Next/TS/shadcn). Para logos de empresas conocidas, `logo_search`.
4. **Preview** — Levantar el dev server con el preview (ver `.claude/launch.json`) y
   verificar en vivo: legibilidad, contraste, responsive (375 / 768 / 1280), reduced-motion.
5. **Auditar (Golden Rules)** — Antes de declarar "listo": build verde, sin datos
   inventados (placeholders marcados), `grep` de dependencias al cambiar datos compartidos.
6. **Deploy** — Publicar preview en Vercel (`vercel deploy --prod`). Para SPA con
   client-side routing, incluir `vercel.json` con rewrite a `/index.html`.
7. **Cerrar sesion** — Actualizar `docs/kb/SESSIONS.md` con lo hecho, decisiones y pendientes.

## Reglas de calidad para UI (resumen)

- **Legibilidad sobre fondos oscuros:** si el base layer fija un color de heading
  (ej. `text-navy-800`), los titulos en secciones oscuras necesitan `text-white` explicito.
- **Navbar transparente sobre hero oscuro:** usar variante clara (logo + links) sin scroll,
  oscura al hacer scroll.
- **No emojis como iconos:** SVG inline o set consistente.
- **Datos reales vs placeholder:** nunca inventar contacto/numeros; marcar placeholders y
  ocultarlos en previews para clientes si aplica.
- **Imagenes:** optimizar (WebP/JPEG) antes de publicar; declarar `width/height` o
  `aspect-ratio` para evitar CLS.
- **SEO por ruta** en SPA: actualizar `<title>`/meta por pagina (hook simple en `useEffect`).

## Convenciones de entorno (Windows + OneDrive)

- Si el proyecto vive en OneDrive, **node_modules no debe sincronizarse**: montarlo como
  *junction* a una carpeta fuera de OneDrive (ej. `C:\dev\<slug>`) y usar el helper
  `scripts/install-deps.ps1` en vez de `npm install` directo.
- En Windows, si `python3` resuelve al stub de la Microsoft Store, crear un shim
  `python3.exe` (copia de `python.exe`) en el dir real de Python.
