---
description: Crea un sitio web production-grade desde la plantilla verificada del kit (Astro 7 + Tailwind 4 por defecto; Next.js 16 para apps) y lo deja con build, tests y SEO en verde.
argument-hint: "[nombre] [tipo: landing|corporativo|portfolio|local|ecommerce|blog|saas]"
---

# /new-website — nuevo sitio desde la plantilla del kit

Argumentos: `$ARGUMENTS`. Carga la skill **web-design-kit** y sigue su flujo completo. Resumen operativo:

## 0. Contexto (una sola ronda de preguntas)
- Falta nombre o tipo → pregúntalo. Tipo `saas` con área privada → ruta Next (`references/stack-next.md`); todo lo demás → Astro.
- Brief mínimo: qué vende, público, 3 adjetivos de marca, páginas, datos reales disponibles, hosting, política de crawlers IA.
- Si el directorio actual ya tiene `package.json`, **no sobreescribas**: pregunta si crear subcarpeta.

## 1. Scaffold (Astro)
Copia la plantilla del plugin al proyecto (`${CLAUDE_PLUGIN_ROOT}/templates/astro-marketing/` → `.`), excluyendo `node_modules`, `dist`, `.astro`. Luego:
```bash
npm install --ignore-scripts --no-fund --no-audit
npm run check && npm run build
```
Debe quedar verde **antes** de cambiar nada. Si falla, es entorno (Node ≥ 22.12) o red: diagnostica, no parches.

## 2. Configurar
- `src/config/site.ts`: nombre, `url`, `locale`, nav con barra final (`/ruta/`), contacto real o `null` (nunca inventado).
- `astro.config.mjs`: `site`. `public/robots.txt`: política IA según la respuesta del cliente.
- Hosting: deja `wrangler.jsonc` (Cloudflare) o `vercel.json`; borra el que no uses.

## 3. Tokens y dirección
Elige dirección en `references/design-anti-slop.md` → copia `assets/tokens.example.json` a `tokens.json` → ajusta → `node ${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/tokens-to-theme.mjs tokens.json src/styles/global.css`. Fuentes vía `@fontsource-variable/*` + Fonts API local.

## 4. Construir páginas
Arquitectura desde el contenido real. SEO por página con `<SEO>` + JSON-LD. Motion según `references/motion.md`. Marca todo dato ausente como `PLACEHOLDER`.

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
