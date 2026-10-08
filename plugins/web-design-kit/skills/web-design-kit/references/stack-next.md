# Stack secundario — Next.js 16.4 para apps, SaaS y dashboards

**Última verificación: 2026-10-07** (`next@16.4.0`, `react@19.3.0` — ver `versions.md`).

Usa esta ruta **solo** cuando el sitio es en realidad una app: login, área privada, datos por
usuario, dashboards. Para marketing/contenido la plantilla Astro gana en coste, SEO y simplicidad.
Patrón habitual en 2026: **marketing en Astro + app en Next en subdominio** (`app.dominio.com`).

## Scaffold
```bash
npx create-next-app@latest mi-app --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"
```
- `create-next-app` 16.4 activa **Cache Components** por defecto (`cacheComponents: true` en
  `next.config.ts`): `"use cache"`, `cacheLife()`, `cacheTag()`. No uses `experimental.ppr` (retirado).
- `middleware.ts` pasó a llamarse **`proxy.ts`**. `next lint` ya no existe: usa ESLint/Biome directo.
- Cache Components requiere runtime **Node.js** (no `runtime = 'edge'`).
- Fuentes: `next/font` (self-host automático). Imágenes: `next/image`.
- Tailwind 4: `create-next-app` ya genera `@import "tailwindcss"` + `@theme`. Reutiliza
  `scripts/tokens-to-theme.mjs` del kit apuntando a `src/app/globals.css` (añade los marcadores
  `/* tokens:start */ … /* tokens:end */` dentro de `@theme`).

## SEO en Next (parte pública de la app)
- `export const metadata` / `generateMetadata` por ruta: title, description, `alternates.canonical`,
  `openGraph`, `twitter`, `robots`.
- JSON-LD: `<script type="application/ld+json">` en el layout/página con los mismos builders que
  `templates/astro-marketing/src/lib/jsonld.ts` (copiarlos a `src/lib/`).
- `app/sitemap.ts` y `app/robots.ts` (incluye la política de crawlers IA de `seo.md` §4).
- Páginas de marketing dentro de Next: estáticas (`"use cache"` o sin datos dinámicos). Verifica con
  `next build` que salen como `○ (Static)`.

## Primitivas UI
`npx shadcn@latest init` (Base UI por defecto desde jul-2026; `-b radix` si hace falta). Adapta los
tokens del kit; no aceptes el `slate/zinc` por defecto sin pasar por el brief.

## Motion
`motion` 14 (`motion/react`); `AnimateView` se importa desde `motion/react-animate-view` y
requiere React 19.3+. Misma política que `motion.md`: CSS first, reduced motion siempre.

## Gates (mismos que Astro, adaptados)
- `next build` sin errores · `npm test` (Playwright + axe sobre `next start`) · `check-seo.mjs`
  sobre un export estático de las rutas públicas (`next build` + copia de `.next/server/app/*.html`
  no es fiable: audita contra `next start` con `npx lighthouse` y el Rich Results Test).
- Presupuesto JS más alto que en Astro (app real), pero las rutas públicas deben seguir en
  Lighthouse móvil ≥ 90.

## Deploy
Vercel es el hogar natural (previews por PR, Cache Components). Cloudflare Workers requiere
`@opennextjs/cloudflare`; evalúa coste/complejidad antes. Ver `deploy.md`.

## No verificado aquí
`create-next-app` no se ejecutó en el entorno del kit (sin plantilla incluida todavía). Primera
vez que se use: ejecutar el scaffold, fijar versiones reales en este archivo y considerar
promoverlo a `templates/next-app/`.
