# Versiones verificadas — fuente de verdad del kit

**Última verificación: 2026-10-07** (`npm view <pkg> version` en vivo, no de memoria).
Antes de scaffoldear, re-verifica con `scripts/check-versions.mjs`; si un major cambió, actualiza este archivo.

| Paquete | Versión | Nota |
|---|---|---|
| astro | 7.3.7 | Requiere Node ≥ 22.12. Compilador Rust por defecto. |
| @astrojs/react | 7.0.1 | Peer: `oxc-transform-react ^0.145.0` (instalar explícito). |
| @astrojs/sitemap | 3.7.4 | |
| @astrojs/mdx | 8.0.3 | |
| @astrojs/cloudflare | 14.3.4 | Solo si hay rutas on-demand. |
| @astrojs/vercel | 11.0.12 | Solo si hay rutas on-demand. |
| @astrojs/check | 0.9.10 | **Peer TS `^5 || ^6`** → el template fija TypeScript 5.x. |
| typescript | 5.9.3 (template) / 7.0.2 (latest) | TS 7 (port Go) aún no soportado por @astrojs/check. Re-evaluar. |
| tailwindcss / @tailwindcss/vite | 4.3.3 | Config CSS-first (`@theme`), sin `tailwind.config.js`. |
| react / react-dom | 19.3.0 | `<title>`/`<meta>` nativos; `react-helmet` obsoleto. |
| motion | 14.0.0 | `AnimateView` requiere React 19.3+. Paquete `framer-motion` = obsoleto. |
| gsap | 3.15.0 | 100% gratis incl. plugins (ScrollTrigger, SplitText). Opt-in. |
| lenis | 1.3.26 | Opt-in; `@studio-freight/lenis` deprecado. |
| next | 16.4.0 | Cache Components on por defecto. Para SaaS/dashboards. |
| vite | 8.3.3 | Rolldown. Lo trae Astro; no instalar aparte. |
| react-router | 8.4.0 | Solo si el cliente exige React-only SSR. Nunca v6 SPA. |
| @playwright/test | 1.64.0 | |
| @axe-core/playwright | 4.13.0 | |
| @lhci/cli | 0.15.1 | Lighthouse 13.5.0 — IDs de auditoría renombrados vs ≤12. |
| sharp | 0.35.5 | Lo trae Astro `<Image>`. |
| web-features | 3.40.1 | Para consultar Baseline en build. |

## Hechos verificados en este entorno (2026-10-07)
- `npm create astro@latest --template minimal` falla sin acceso a GitHub raw → el kit scaffoldea a mano desde `templates/`.
- Build Astro 7.3.7 + Tailwind 4.3.3 + isla React + sitemap: **0.8 s**, `astro check` 0 errores.

## Añadido tras la construcción (2026-10-07)
- `oxc-transform-react`: latest 0.153.0; `@astrojs/react@7.0.1` pide `^0.145.0` y su `@vitejs/plugin-react@6.1.2` peerOptional `^0.152.0` → warning ERESOLVE inofensivo.
- `@fontsource-variable/fraunces`, `@fontsource-variable/inter`: 5.3.0 (proveedor local offline para la Fonts API).
- `motion@14`: `AnimateView` NO sale de `motion/react`; se importa desde `motion/react-animate-view` (requiere React 19.3+).
- `gsap@3.15`: `import gsap from 'gsap'`, plugins en `gsap/ScrollTrigger`, `gsap/SplitText`; tipos incluidos. Chunk gz GSAP+ScrollTrigger+SplitText ≈ 47 KB (consume solo el presupuesto de motion).
- `lenis@1.3.26`: `respectReducedMotion` por defecto `true`; gz ≈ 5.6 KB.
- `astro preview` 7.x: subcomandos `stop/status/logs`, flags `--background`, `--ignore-lock` (necesario como webServer de Playwright).
- Astro 7 no procesa SVG en `<Picture>` sin `dangerouslyProcessSVG` → el hero usa JPG generado.
