# Tipografía: escala fluida, fuentes variables autoalojadas y español

**Última verificación: 2026-10-07** — Astro 7.3.7 (Fonts API + `fontProviders.local()`), Tailwind 4.3.3
(`text-balance`, `text-pretty`, `font-features-[…]`, `font-stretch-*` comprobados en el compilador),
`@fontsource-variable/*` 5.3.0 (nombres de archivo verificados en los paquetes).

La tipografía lleva la personalidad del sitio. Dos decisiones bien hechas (familia + escala) valen
más que cualquier efecto. Todo lo de aquí se expresa en tokens (`font.*`, `text.*`, `leading.*`,
`tracking.*`) y sale por `tokens-to-theme.mjs`.

## 1. Escala fluida con `clamp()`

Fórmula (viewport mínimo `vmin`, máximo `vmax`, en px; tamaños en rem):

```
pendiente  = (max − min) / ((vmax − vmin) / 16)
intersección = min − pendiente × (vmin / 16)
font-size: clamp(min, intersección rem + (pendiente × 100) vw, max)
```

Ejemplo (360→1280px, 2.2rem→3.4rem): `clamp(2.2rem, 1.7304rem + 2.087vw, 3.4rem)`. No la calcules
a mano: declara `kit.fluid` en el token y el script la escribe (ver `tokens-dtcg.md` §3).

Reglas:
- **Base 1rem→1.125rem** como mucho; el cuerpo no debe superar 18px en escritorio para
  líneas de 60–75 caracteres.
- Ratio de pasos ≈ 1.2 en móvil y 1.25–1.333 en escritorio; el `clamp()` lo hace variable por sí
  solo. El `display` puede saltarse la progresión (ratio 1.5+) porque es el momento firma.
- Accesibilidad: el componente `vw` nunca debe dominar. Si `pendiente × 100 > 5vw`, comprueba que
  al hacer zoom 200 % el texto sigue creciendo (WCAG 1.4.4); por eso el mínimo siempre va en rem.
- `line-height` en número puro (`1.05` display, `1.2` titulares, `1.5–1.6` cuerpo; serifs un poco
  más). Nunca en px. `letter-spacing` en `em`, negativo solo por encima de ~32px.
- Longitud de línea: `max-inline-size: 68ch` en párrafos (`--container-prose`); 45–75 ch es el
  rango; las serifs toleran el extremo alto; para `text-sm` baja a 55–60ch.

## 2. Fuentes variables autoalojadas (lo que usa el template)

Pipeline verificado offline: `@fontsource-variable/<slug>` (npm) → `astro.config.mjs` con
`fontProviders.local()` → `<Font cssVariable="--font-x" preload />` en `Base.astro` → la variable
`--font-x` llega al `@theme` vía `font.display: ["var(--font-x, Georgia, serif)"]`.

```js
// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';
export default defineConfig({
  fonts: [{
    provider: fontProviders.local(),
    name: 'Newsreader Variable',
    cssVariable: '--font-newsreader',
    fallbacks: ['Georgia', 'Times New Roman', 'serif'],
    options: { variants: [
      { src: ['@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'], weight: '200 800', style: 'normal', display: 'swap' },
      { src: ['@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2'], weight: '200 800', style: 'italic', display: 'swap' },
    ] },
  }],
});
```

```astro
<!-- Base.astro: preload SOLO del display normal (define el LCP del titular). -->
<Font cssVariable="--font-newsreader" preload={[{ style: 'normal' }]} />
<Font cssVariable="--font-inter" />
```

Qué hace Astro en build (comprobado en `dist/index.html`):
- Copia los `.woff2` a `/_astro/fonts/<hash>.woff2`, emite `@font-face` con `font-display: swap`
  y el rango `font-weight: 100 900` del archivo variable.
- Genera un **fallback con métricas ajustadas** (`size-adjust`, `ascent-override`,
  `descent-override`, `line-gap-override`) a partir de la primera fuente de `fallbacks` que sea
  local (`Times New Roman`, `Arial`…), lo que elimina casi todo el CLS del swap.
- Inyecta `<link rel="preload" as="font" crossorigin>` solo para las variantes pedidas.
- Define `--font-newsreader: "Newsreader Variable-<hash>", "… fallback: Times New Roman", Georgia, …`.

Elección de archivo dentro del paquete (`ls node_modules/@fontsource-variable/<slug>/files`):
- `<slug>-latin-wght-normal.woff2`: solo eje peso, el más ligero (≈ 20–60 kB).
- `<slug>-latin-opsz-normal.woff2`: peso + tamaño óptico (Fraunces, Newsreader, Inter, Bricolage).
  Úsalo cuando la misma familia hace display y texto: `font-variation-settings: "opsz" auto` ajusta
  contraste y espaciado por tamaño.
- `<slug>-latin-wdth-normal.woff2`: peso + anchura (Archivo, Bricolage). Permite `font-stretch`
  condensado/expandido para titulares sin segunda familia.
- `<slug>-latin-standard-normal.woff2`: todos los ejes (`SOFT`, `WONK` en Fraunces). Más pesado.
- El subconjunto **`latin` ya cubre el español** (á é í ó ú ü ñ ¿ ¡ « »). `latin-ext` solo si hay
  catalán/portugués con caracteres fuera de Latin-1 (p. ej. `ŀ`, `ã` sí está en latin).
- Peso recomendado total de fuentes por página: ≤ 150 kB; dos familias variables, 3 archivos máx.

Fuentes que NO existen como `-variable` (solo `@fontsource/<slug>` estáticas, 5.3.0 verificado):
Instrument Serif, DM Serif Display, DM Mono, IBM Plex Mono. Si una dirección las pide, instala el
paquete estático y declara una variante por peso (`weight: '400'`), o elige la alternativa variable.

## 3. `font-display` y fallbacks

- `display: 'swap'` para texto (Astro lo pone por defecto). `optional` solo si la marca tolera
  ver el fallback en primera visita (sitios muy orientados a rendimiento).
- Nunca `block`. En móviles 3G el titular quedaría invisible.
- El fallback ajustado funciona porque el `name` de `fallbacks[0]` existe en el SO; usa siempre una
  de: `Georgia`, `Times New Roman` (serif), `Arial`, `Segoe UI`, `system-ui` (sans). Si pones solo
  genéricas (`serif`), Astro no puede calcular `size-adjust`.
- Para comprobar el swap sin red: DevTools → Network → "Font" → throttling "Slow 3G" y mira el CLS
  en Performance Insights. Objetivo: CLS ≤ 0.02 atribuible a fuentes.

## 4. Utilidades Tailwind 4.3 relevantes (verificadas en el compilador)

| Clase | CSS | Uso |
|---|---|---|
| `text-balance` | `text-wrap: balance` | titulares de ≤ 4 líneas (ya por defecto en `h1–h3` del template) |
| `text-pretty` | `text-wrap: pretty` | párrafos: evita viudas y mejora el ragged (por defecto en `p`) |
| `font-features-["tnum"]`, `font-features-["ss01","onum"]` | `font-feature-settings: "tnum"` | tablas de precios, cifras alineadas, alternativas estilísticas |
| `font-features-(--my-feat)` | `font-feature-settings: var(--my-feat)` | reutilizar un set definido en `@theme` |
| `font-stretch-condensed` / `-expanded` | `font-stretch` | titulares con eje `wdth` (Archivo, Bricolage) |
| `hyphens-auto` | `hyphens: auto` | columnas estrechas en español (requiere `lang="es"`) |
| `font-display` (del `@theme`) | `font-family` **+** `font-feature-settings` + `font-variation-settings` | ver abajo |

Tailwind 4 permite fijar features y ejes por familia en el tema; la utilidad `font-display`
emite las tres propiedades (comprobado):

```css
@theme {
  --font-display: var(--font-fraunces, Georgia, serif);
  --font-display--font-feature-settings: "ss01", "onum";
  --font-display--font-variation-settings: "opsz" 144, "SOFT" 30;
}
```
Estas sub-claves `--font-x--font-*` se escriben a mano fuera de los marcadores o como tokens
`fontFamily` adicionales no soportados: el generador DTCG las ignora, así que si las usas, ponlas en
la capa base de `global.css` (como hace hoy el template con `h1, h2, h3`).

Features útiles: `"kern" "liga" "calt"` siempre (cuerpo); `"tnum"` en tablas y precios; `"onum"`
(números antiguos) en texto corrido serif; `"smcp"` para versalitas reales en vez de `uppercase`;
`"ss01"…` según la fuente (Fraunces tiene `WONK`, Inter tiene `ss01` para dígitos abiertos).
Comprueba que la fuente tenga la feature (wakamaifondue.com) antes de declararla.

## 5. Tipografía del español

- **`<html lang="es">`** (o `es-MX`, `es-ES` si el cliente lo pide): activa diccionario de guiones
  para `hyphens: auto`, comillas correctas en `<q>` («…») y pronunciación de lectores de pantalla.
  El template ya lo pone; no lo pierdas al crear layouts nuevos.
- **Signos de apertura `¿ ¡`**: en titulares grandes comprueba que la fuente display los dibuje con
  el mismo peso que `? !` (muchas display anglosajonas los tienen mal kerneados o diminutos).
  Prueba el titular real `¿Necesitas…?` a `text-display` antes de fijar la fuente.
- **Acentos en display**: a L alto y tracking negativo (−0.045em) las tildes pueden chocar con la
  línea superior. Sube `line-height` del display a ≥ 1.05 y revisa `Á É Í Ó Ú` mayúsculas; en
  mayúsculas la tilde es obligatoria en español (RAE), no la elimines "por diseño".
- **Palabras largas**: el español promedia más caracteres por palabra que el inglés; a 390px un
  titular de 3 palabras puede desbordar. Usa `text-balance` + `overflow-wrap: anywhere` en
  `h1`, y `hyphens-auto` solo en párrafos de columnas estrechas (nunca en titulares).
- **Longitud de texto**: el español ocupa ~15–25 % más que el inglés. Los botones y etiquetas de
  navegación necesitan `min-inline-size` fluido, no anchos fijos.
- **Comillas y puntuación**: usa « » o "" (tipográficas), nunca "" rectas; rayas `—` sin espacios
  para incisos; `hanging-punctuation: first last` (ya en `:root`) cuelga las comillas de apertura.
- **Números**: separador de miles con punto o espacio fino según el país del cliente; usa
  `Intl.NumberFormat('es-ES')` en islas y `font-features-["tnum"]` en tablas.
- **Mayúsculas**: evita `uppercase` en frases largas (se lee peor en español por las tildes y la
  longitud). Si una etiqueta debe ir en mayúsculas, usa versalitas (`"smcp"`) o `tracking-wide`
  con `text-xs`, y nunca como patrón repetido encima de cada sección (ver `design-anti-slop.md`).

## 6. Checklist antes de cerrar la tipografía

- [ ] Dos familias como máximo, claramente distintas; o una variable con `opsz`.
- [ ] Un solo `preload` (display normal). Fuentes totales ≤ 150 kB.
- [ ] Fallback con métricas ajustadas presente en `dist/*.html` (`size-adjust`).
- [ ] Cuerpo 16–18px, 60–75 ch, `line-height` 1.5–1.6; display con `text-balance`.
- [ ] Titular real con `¿ ¡` y tildes probado a 390px y 1280px.
- [ ] `lang="es"` en `<html>`; `hyphens-auto` solo en columnas estrechas.
- [ ] Ninguna palabra sola destacada en color/cursiva en el titular; ningún eyebrow ALL-CAPS por defecto.
