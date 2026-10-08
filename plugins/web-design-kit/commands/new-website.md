---
description: Crea un sitio web production-grade desde la plantilla verificada del kit (Astro 7 + Tailwind 4 por defecto; Next.js 16 para apps) y lo deja con build, tests y SEO en verde. Con --from <brief.json> reconstruye un sitio migrado (/migrate-site) sin volver a preguntar lo que ya se sabe.
argument-hint: "[nombre] [tipo: landing|corporativo|portfolio|local|ecommerce|blog|saas] [--from migration/brief.json]"
---

# /new-website — nuevo sitio desde la plantilla del kit

Argumentos: `$ARGUMENTS`. Carga la skill **web-design-kit** y sigue su flujo completo. Resumen operativo:

## 0. Contexto (una sola ronda de preguntas)
- Falta nombre o tipo → pregúntalo. Tipo `saas` con área privada → ruta Next (`references/stack-next.md`); todo lo demás → Astro.
- Brief mínimo: qué vende, público, 3 adjetivos de marca, páginas, datos reales disponibles, hosting, política de crawlers IA.
- Si el directorio actual ya tiene `package.json`, **no sobreescribas**: pregunta si crear subcarpeta.

### 0-bis. `--from <brief.json>` (reconstrucción tras `/migrate-site`)
Si hay `--from`, el brief ya existe: **no repitas preguntas**. Procedimiento:
1. Carga el brief y valídalo contra el schema v1 (`assets/brief.schema.json`) con el validador sin dependencias:
   ```bash
   node --input-type=module -e "import { readFileSync } from 'node:fs'; import { validateBrief } from '${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/migrate/lib/brief.mjs'; const r = validateBrief(JSON.parse(readFileSync(process.argv[1], 'utf8'))); console.log(r.ok ? 'brief OK' : r.errors.join('\n')); process.exit(r.ok ? 0 : 1)" migration/brief.json
   ```
   Si no valida, STOP y muestra los errores (no "arregles" el brief a mano sin decirlo).
2. Clasifica cada campo por `sources[campo].confidence`:
   - `high` → **no se pregunta**; se usa tal cual (name, contact.*, locale, brand.colors…).
   - `medium` / `low` → se confirma. `null` → se pide o se deja `null` (nunca inventado).
   Haz **una sola ronda**: una lista "esto es lo que encontré; confirma o corrige" con los `medium/low` y los `null`
   relevantes (contacto, redes, horario, servicios, fuentes).
3. Pregunta solo dos cosas más (misma ronda):
   - **Dirección de diseño.** Default: *conservar marca, rehacer layout* → `brand.colors` siembran `tokens.json`
     (el primero con `role: primary` → `accent`; neutros derivados en OKLCH, ver `references/tokens-dtcg.md`),
     `brand.fonts[].fontsource` → paquetes `@fontsource-variable/*` + Fonts API local; `brand.logo` → `src/assets/`.
     Si `fontsource` es `null` (fuente desconocida), propone la familia más cercana de `references/typography.md` y márcalo como decisión reversible.
   - **Qué páginas antiguas se descartan** (muestra `brief.pages` tipo `page`, con título y `sourceUrl`). Lo descartado
     va a `migration/mapping.json` como `"/old/": null` para que `plan-redirects` genere el 301 al padre.
4. Contenido:
   - `type: post` → copia `migration/content/<slug>.md` a `src/content/blog/<slug>.md`. El schema de la colección
     (`src/content.config.ts`) acepta el frontmatter del extractor (`null` permitido). Si `date` es `null`, pide la
     fecha o usa la del sitemap/WXR; nunca la de hoy sin avisar. Primer `images[].local` → `image` (ruta en `public/` o `src/assets/migrated/`).
   - `type: page` → `src/content/pages/<slug>.md` (Markdown tal cual) + `src/pages/<slug>.astro` que lo renderiza:
     ```astro
     ---
     import Base from '../layouts/Base.astro';
     import Section from '../components/Section.astro';
     import Prose from '../components/Prose.astro';
     import { Content, frontmatter } from '../content/pages/<slug>.md';
     ---
     <Base title={frontmatter.title} description={frontmatter.description ?? undefined}>
       <Section id="<slug>" title={frontmatter.title} as="h1"><Prose><Content /></Prose></Section>
     </Base>
     ```
     La home, contacto y servicios se rehacen con `Section`/`Card` a partir del Markdown (layout nuevo, mismo contenido).
   - Imágenes: `migration/assets/*` → `src/assets/migrated/`; reescribe `../assets/<img>` → `../../assets/migrated/<img>`
     en los `.md` (los posts resuelven rutas relativas y las optimizan en build).
   - Si `migration.posts > 0` → `showBlog: true` en `src/config/site.ts` (añade "Blog" al menú; `/blog/` entra en el sitemap solo si hay `.md`).
5. Sigue con los pasos 1–6 de abajo. Al terminar, vuelve a `/migrate-site` fase 5 (`plan-redirects` + `check-redirects` contra `dist/`): sin paridad no hay entrega.
Doctrina: `references/migration.md`.

## 1. Scaffold (Astro)
Copia la plantilla del plugin al proyecto (`${CLAUDE_PLUGIN_ROOT}/templates/astro-marketing/` → `.`), excluyendo `node_modules`, `dist`, `.astro`. Luego:
```bash
npm install --ignore-scripts --no-fund --no-audit
npm run check && npm run build
```
Debe quedar verde **antes** de cambiar nada. Si falla, es entorno (Node ≥ 22.12) o red: diagnostica, no parches.

## 2. Configurar
- `src/config/site.ts`: nombre, `url`, `locale`, nav con barra final (`/ruta/`), contacto real o `null` (nunca inventado), `showBlog` si hay posts.
- `astro.config.mjs`: `site`. `public/robots.txt`: política IA según la respuesta del cliente.
- Hosting: deja `wrangler.jsonc` (Cloudflare) o `vercel.json`; borra el que no uses.

## 3. Tokens y dirección
Elige dirección en `references/design-anti-slop.md` → copia `assets/tokens.example.json` a `tokens.json` → ajusta → `node ${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/tokens-to-theme.mjs tokens.json src/styles/global.css`. Fuentes vía `@fontsource-variable/*` + Fonts API local.

## 4. Construir páginas
Arquitectura desde el contenido real. SEO por página con `<SEO>` + JSON-LD. Motion según `references/motion.md`. Marca todo dato ausente como `PLACEHOLDER`.
Blog: `src/content/blog/*.md` → `/blog/` y `/blog/<slug>/` ya existen en la plantilla (Article + BreadcrumbList, canónica, `<time>`). Sin posts, `/blog/` es `noindex` y no sale en el sitemap.

## 5. Gates
```bash
npm run check && npm run build
npx playwright install chromium && npm test
node ${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/check-seo.mjs dist --site https://<dominio>
npx lhci autorun
grep -rn PLACEHOLDER src dist
```
Pide a otra sesión `seo-audit` y `design-critique` (maker ≠ checker).

## 6. Cerrar
Escribe `CLAUDE.md` del proyecto (la plantilla trae uno), reporta gates con evidencia, `PLACEHOLDER` pendientes y el comando de deploy (`references/deploy.md`).
