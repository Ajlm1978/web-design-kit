# Quality gates — Definition of Done de un sitio hecho con el kit

Un sitio **no está terminado** hasta que pasa TODOS los gates de abajo. No hay "casi":
cada gate es binario y se verifica con un comando, no con una opinión.

## Principio: quien construye no es quien audita (maker ≠ checker)

La auditoría final la ejecuta **un agente distinto** al que construyó la página
(en Claude Code: un subagente nuevo, sin el contexto de la sesión de construcción, o la
skill `design-critique`). Motivo: el agente que acaba de escribir el código tiende a
confirmar sus propias decisiones, a "ver" lo que esperaba ver y a saltarse comandos
porque "ya lo probé antes". El auditor:

1. Parte del repo tal cual está en disco, no de lo que el constructor dice que hizo.
2. Ejecuta cada comando de esta lista y pega la salida real (trimmed) en el informe.
3. Reporta hallazgos con `archivo:línea` y el fix propuesto. No pone nota ni puntuación.
4. No corrige él mismo: devuelve la lista al constructor. Si el constructor discute un
   hallazgo, se re-ejecuta el comando delante de ambos.

Si no hay forma de levantar un segundo agente, al menos se abre una sesión nueva de
Claude Code con el prompt: *"Audita este sitio contra `references/quality-gates.md`.
No construiste nada aquí; verifica cada gate ejecutando el comando y pega la evidencia."*

## Gates (todos obligatorios)

Comandos desde la raíz del proyecto (el template `astro-marketing` ya trae los scripts).

| # | Gate | Umbral | Comando / cómo verificar |
|---|---|---|---|
| 1 | Build | verde, 0 warnings nuevos | `npm run build` |
| 2 | Tipos | `astro check` **0 errores** (los hints no bloquean) | `npm run check` |
| 3 | Accesibilidad automática | **0 violaciones `serious`/`critical`** de axe en `/`, `/contacto`, `/404` a **375 / 768 / 1280 px**, en **light y dark** | `npm test` (Playwright + `@axe-core/playwright`). Para dark, añade `colorScheme: 'dark'` al `test.use` o duplica el proyecto en `playwright.config.ts` |
| 4 | SEO técnico | `check-seo` **0 errores** (warnings se listan y se deciden) | `node <kit>/scripts/check-seo.mjs dist --site https://dominio-real.com` |
| 5 | Lighthouse (móvil) | Performance **≥ 90**, Accessibility **100**, SEO **100**, Best Practices **≥ 90** en `/` y la página más pesada | `npm run build && npx lhci autorun` (ajusta `preset: 'mobile'` o lanza una segunda pasada; el `lighthouserc.cjs` del template usa desktop por defecto). Repite 3 veces: cuenta la mediana, no la mejor |
| 6 | Presupuesto JS | **≤ 100 KB gzip** de JS total en páginas de marketing (home, servicios, contacto) | `find dist -name '*.js' -path '*_astro*' -exec gzip -c {} \; \| wc -c` y revisa por página en el panel Network (filtrar JS, "transferred") |
| 7 | Imagen LCP | **≤ 200 KB** la imagen que pinta el LCP, formato AVIF/WebP, con `width`/`height` y `fetchpriority="high"` | `ls -la dist/_astro/*.{avif,webp}`; confirma en Lighthouse → "Largest Contentful Paint element" |
| 8 | Fuentes | **≤ 3 archivos** de fuente cargados en la home (variable fonts cuentan 1), `font-display: swap` u `optional`, self-hosted | `grep -o '[^"]*\.woff2' dist/index.html \| sort -u \| wc -l` |
| 9 | Sin placeholders | **0** coincidencias de `PLACEHOLDER`, `lorem`, `TODO:`, `example.com`, `+1 555` antes de entregar al cliente | ver grep abajo |
| 10 | Reduced motion | Con `prefers-reduced-motion: reduce` **nada se mueve** más de un fade; sin autoplay de vídeo; sin parallax | Manual: DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" y recorre la home completa. Anota qué revisaste |
| 11 | 404 real | `/esta-url-no-existe` devuelve **estado HTTP 404** (no 200 con la portada), con la página `404.astro`, `noindex`, enlace a la home | `curl -s -o /dev/null -w '%{http_code}\n' https://dominio/no-existe` → `404`. En Cloudflare: `not_found_handling: "404-page"`; en Vercel: nunca añadir rewrite SPA |
| 12 | Metadatos por página | cada página tiene `<title>` único (≤ 60 car.), `description` única (70–160), `canonical` absoluta, OG image 1200×630 | lo cubre `check-seo`; verifica a mano la OG con https://www.opengraph.xyz/ |

### Grep de placeholders (gate 9)

```bash
grep -rniE 'PLACEHOLDER|lorem ipsum|TODO:|FIXME|example\.com|\+1 ?555|Nombre del cliente|hero-placeholder' \
  src public astro.config.mjs wrangler.jsonc vercel.json \
  --include='*.astro' --include='*.ts' --include='*.tsx' --include='*.mdx' --include='*.md' \
  --include='*.json' --include='*.jsonc' --include='*.mjs' --include='*.css' --include='*.txt' \
  && echo '✗ Quedan placeholders' || echo '✓ Sin placeholders'
```

El template trae placeholders a propósito (`src/config/site.ts`, `wrangler.jsonc`, `Footer.astro`,
imágenes `hero-placeholder.*`): este grep **debe** fallar en un template recién scaffoldeado y
pasar antes de la entrega.

## Orden recomendado de ejecución

```
npm ci --ignore-scripts
npm run check            # gate 2
npm run build            # gate 1
npm test                 # gate 3
node <kit>/scripts/check-seo.mjs dist --site https://dominio-real.com   # gate 4, 12
npx lhci autorun         # gate 5 (x3, mediana)
# gates 6-8: inspección de dist/
# gate 9: grep
# gate 10: manual con DevTools
# gate 11: tras deploy de preview, curl
```

## Qué NO es un gate (y por qué)

- **"Se ve bien"**: subjetivo. Lo cubre la crítica de diseño (`design-critique`), que
  produce hallazgos, no un aprobado.
- **Lighthouse desktop**: casi siempre da 100; el umbral que importa es **móvil** con
  throttling por defecto.
- **axe 0 violaciones de cualquier nivel**: `minor`/`moderate` se listan y se deciden
  caso a caso; exigir cero genera ruido y acaba ignorándose.

## Informe del auditor (plantilla)

```
## Auditoría — <sitio> — <fecha> — auditor: <agente/sesión>
Gate 1 build: ✓ (0.8 s, 0 warnings)
Gate 2 check: ✓ 0 errores, 2 hints
Gate 3 a11y:  ✗ 1 serious @375 dark — src/components/Header.astro:42 contraste 3.9:1 del enlace "Contacto"
              fix: usar text-ink en lugar de text-muted sobre bg-paper-dark
Gate 4 seo:   ✓ 0 errores, 1 warning (description /contacto 62 car.)
Gate 5 LH:    perf 94/91/93 (mediana 93) · a11y 100 · seo 100 · bp 96
...
Bloqueantes: 1. No entregar hasta cerrar Gate 3.
```
