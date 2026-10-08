# CLAUDE.md — convenciones de este sitio

Sitio de marketing estático (Astro 7 + Tailwind 4 + islas React con motion).
Lee `README.md` para estructura y despliegue. Estas reglas tienen prioridad.

## Reglas no negociables

1. **Nada de datos inventados.** Teléfonos, emails, direcciones, horarios,
   cifras, testimonios, logos de clientes: solo si el cliente los ha dado.
   Si faltan, deja el campo en `null` en `src/config/site.ts` o marca el texto
   con `PLACEHOLDER`. Nunca uses ejemplos "realistas".
2. **Zero JS por defecto.** Páginas y componentes en `.astro`. Una isla React
   (`src/components/islands/`) solo cuando hay interacción real, siempre con
   `client:visible` o `client:idle`, nunca `client:load` sin motivo.
3. **Accesibilidad AA.** Un solo `<h1>` por página, landmarks semánticos,
   `alt` real (o `alt=""` si es decorativa), foco visible, contraste >= 4.5:1
   en texto. `npm test` debe quedar en verde antes de dar algo por terminado.
4. **Movimiento respetuoso.** Toda animación CSS va dentro de
   `@media (prefers-reduced-motion: no-preference)`; las scroll-driven además
   dentro de `@supports (animation-timeline: view())`. El estado por defecto
   es visible. En React usa `useReducedMotion()` de `motion/react`.
5. **Tokens, no valores sueltos.** Colores, tipos, espaciados y radios salen
   del bloque `@theme` de `src/styles/global.css` (entre `tokens:start` y
   `tokens:end`). No escribas hex/px arbitrarios en componentes; si falta un
   token, añádelo al bloque.
6. **SEO por componente.** Cada página pasa `title`, `description` y, si
   procede, `jsonLd` a `<Base>`. JSON-LD solo con los constructores de
   `src/lib/jsonld.ts`. No añadir `FAQPage`.
7. **Imágenes** siempre en `src/assets/` y vía `<Image>`/`<Picture>` de
   `astro:assets` con `width`/`height`. Solo el hero lleva `loading="eager"` +
   `fetchpriority="high"`; el resto `loading="lazy"`.
8. **Idioma.** Contenido, comentarios y docs en español; identificadores de
   código en inglés.

## Flujo de trabajo

```sh
npm install --ignore-scripts --no-fund --no-audit
npm run dev          # desarrollo
npm run check        # tipos (0 errores obligatorio)
npm run build        # genera dist/
npm test             # axe + SEO (requiere `npm run test:install` la primera vez)
```

## Despliegue

- **Cloudflare Workers Static Assets**: `npm run build && npx wrangler deploy`
  (config en `wrangler.jsonc`, cabeceras en `public/_headers`).
- **Vercel**: push al repo conectado; `vercel.json` solo contiene cabeceras.
  No añadir rewrites SPA.

## Versiones fijadas (no subir majors sin verificar)

- `astro` ^7.3, `@astrojs/react` ^7.0 (+ `oxc-transform-react` ^0.145 explícito),
  `@astrojs/sitemap` ^3.7, `tailwindcss`/`@tailwindcss/vite` ^4.3,
  `react` ^19.3, `motion` ^14, `typescript` ^5.9 (`@astrojs/check` no soporta TS 7),
  `@playwright/test` ^1.64, `@axe-core/playwright` ^4.13.
- Fuentes: `@fontsource-variable/fraunces` y `@fontsource-variable/inter` ^5.3
  consumidas por la Fonts API de Astro con `fontProviders.local()`.
