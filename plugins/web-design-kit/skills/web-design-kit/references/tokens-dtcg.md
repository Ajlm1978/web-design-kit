# Tokens DTCG → `@theme` de Tailwind 4

**Última verificación: 2026-10-07** (script probado contra `templates/astro-marketing/src/styles/global.css`; build Astro 7.3.7 + Tailwind 4.3.3 OK con el bloque generado).

El kit NO escribe colores ni tamaños a mano en el CSS. La fuente de verdad es un archivo
`*.tokens.json` en formato **W3C Design Tokens (DTCG) 2025.10**; el script
`scripts/tokens-to-theme.mjs` lo convierte en variables `@theme` y las inyecta en `global.css`
entre los marcadores `/* tokens:start */` y `/* tokens:end */`. Todo lo demás del CSS
(capa base, utilidades, view transitions) queda intacto.

```
brief → design plan → tokens.json → tokens-to-theme.mjs → @theme → clases Tailwind (text-ink, bg-paper…)
```

## 1. Comandos

```sh
node scripts/tokens-to-theme.mjs tokens.json src/styles/global.css           # escribe
node scripts/tokens-to-theme.mjs tokens.json src/styles/global.css --check   # valida, no escribe (CI)
node scripts/tokens-to-theme.mjs tokens.json --dry-run                       # imprime el bloque
```

- Node ≥ 22, ESM, **cero dependencias**. Idempotente: si el bloque ya coincide, no toca el archivo.
- Sale con código 1 y mensaje `tokens-to-theme: ERROR — …` ante: JSON inválido, token sin `$type`,
  `$type` no soportado, alias `{a.b}` sin destino, ciclo de alias, `kit.modes` en un token que no
  es color, dos tokens que generan la misma variable, o CSS sin marcadores / con marcadores duplicados.
- Punto de partida: copia `assets/tokens.example.json` al proyecto como `design.tokens.json` y
  **reemplaza la paleta** (es un placeholder deliberadamente neutro; ver §4).

## 2. Formato aceptado (subconjunto DTCG 2025.10)

| `$type` | `$value` aceptado | Salida CSS |
|---|---|---|
| `color` | `{ colorSpace: "oklch", components: [L 0..1, C, H], alpha? }` (también `oklab`, `srgb`, `display-p3`, `hsl`, o `hex`) o string CSS (`oklch(…)`, `#hex`) | `oklch(60% 0.2 47)` |
| `dimension` | `{ value: 1, unit: "rem" }`, número (px) o string CSS (`68ch`, `clamp(…)`) | tal cual |
| `fontFamily` | string o `string[]`; se entrecomillan los nombres con espacios; `var(--font-x, …)` pasa intacto | lista separada por comas |
| `fontWeight` / `number` | número | número |
| `duration` | `{ value: 320, unit: "ms" }`, número (ms) o `"320ms"` | `320ms` |
| `cubicBezier` | `[x1, y1, x2, y2]` o string (`linear(…)`) | `cubic-bezier(…)` |
| `shadow` | objeto `{ offsetX, offsetY, blur, spread, color, inset? }` o array de capas | lista de sombras |

Reglas estructurales:
- `$type` se hereda del grupo. Un alias `{color.brand.600}` sin `$type` propio hereda el del destino.
- **El grupo raíz define el namespace de Tailwind**: `color.*` → `--color-*`, `font.*` → `--font-*`,
  `text.*` → `--text-*`, `spacing.*` → `--spacing-*`, `radius.*` → `--radius-*`, `shadow.*` →
  `--shadow-*`, `ease.*` → `--ease-*`, `duration.*` → `--duration-*`, `leading.*`, `tracking.*`,
  `container.*`. Un grupo raíz con otro nombre puede remapearse con
  `"$extensions": { "kit.namespace": "color" }` (así `semantic.ink` → `--color-ink`).
- El segmento `DEFAULT` se omite: `spacing.DEFAULT` → `--spacing` (la unidad base de Tailwind).
- `$deprecated: true` excluye el token de la salida. Nombres solo con `[a-z0-9_-]`.

## 3. Extensiones del kit (`$extensions`)

**Modos light/dark → `light-dark()`**
```json
"ink": { "$value": "{color.neutral.900}",
         "$extensions": { "kit.modes": { "light": "{color.neutral.900}", "dark": "{color.neutral.75}" } } }
```
genera `--color-ink-light`, `--color-ink-dark` y `--color-ink: light-dark(var(--color-ink-light), var(--color-ink-dark))`.
Si falta `light`, se usa `$value`. Atajo: `"kit.dark": "{…}"`. Funciona porque la capa base del
template declara `color-scheme: light dark` y permite forzar con `data-theme`. Un alias de color que
apunte a un token con modos se emite como `var(--color-destino)`; una `shadow` cuyo `color` sea alias
a un token con modos recibe `light-dark(…)` inline (así `--shadow-ring` queda autocontenida y legible
en DevTools; una `var()` dentro de una lista de sombras también funcionaría, pero oculta el valor).

**Escala fluida → `clamp()`**
```json
"3xl": { "$value": "2.8rem", "$extensions": { "kit.fluid": { "min": "2.2rem", "max": "3.4rem", "viewport": [360, 1280] } } }
```
El script calcula pendiente e intersección: `clamp(2.2rem, 1.7304rem + 2.087vw, 3.4rem)`.
`$value` queda como valor estático de referencia para otras herramientas (Figma, docs).

## 4. Procedimiento brief → tokens

Antes de abrir `tokens.json`, ejecuta la lista de `references/design-anti-slop.md` §2 y elige una
**dirección estética** (§3 de ese documento). Después:

1. **Tres adjetivos de marca** sacados del brief, no inventados ("artesanal, cercano, serio").
   Si el brief no los da, propón tres y confírmalos con el cliente antes de seguir.
2. **Pareja tipográfica** (ver `references/typography.md`). Una familia display + una de texto
   claramente distintas, o una sola variable con ejes `opsz`/`wght`. Instala vía
   `@fontsource-variable/<nombre>` y conecta en `astro.config.mjs` con `fontProviders.local()`.
   En `font.display` / `font.sans` escribe `var(--font-<nombre>, <genérica>)`.
3. **Semilla de color en OKLCH**: un matiz H del mundo del cliente (material, producto, lugar), no
   del catálogo de "colores tech". Deriva:
   - `brand.50…900`: misma H (±8° de deriva está bien), L de 0.97 a 0.26, C en campana (máximo en
     400–500, cae en extremos). Comprueba que cada paso esté dentro del gamut sRGB (si una
     herramienta lo marca como fuera de gamut, baja C antes que cambiar L).
   - `neutral.*`: **la misma H que la marca** con C 0.005–0.02. Nunca grises puros (`C 0`) salvo
     que la dirección lo pida (p. ej. "Precision/technical").
   - Roles en `semantic`: `ink`, `paper`, `muted`, `line`, `surface`, `accent`, `accent-ink`.
     Cada uno con `kit.modes`. El template y sus componentes solo usan estos nombres.
4. **Contraste objetivo** (§5) antes de fijar los pares.
5. **Espaciado y radio como postura**: la unidad base es 4px; `section` y `gutter` fluidos.
   Radios jerárquicos: el valor pequeño en controles, el mediano en tarjetas, el grande solo en
   contenedores de página. Una dirección "editorial" puede tener radio 0 en todo; una "warm craft"
   puede subir `sm` a 0.75rem; nunca el mismo radio para todo.
6. **Movimiento**: dos curvas (`ease.out-*` para entradas, `ease.in-out-*` para cambios de estado)
   y tres duraciones. Más que eso es ruido.
7. `node scripts/tokens-to-theme.mjs design.tokens.json src/styles/global.css` → `npm run build`
   → captura de pantalla → crítica (rúbrica en `design-anti-slop.md` §4).

## 5. Contraste WCAG en términos de OKLCH

WCAG 2.x mide contraste en luminancia relativa, no en L de OKLCH, pero L es un buen predictor y
permite razonar antes de medir. Reglas prácticas (verificadas con una calculadora en el navegador,
no asumas sin medir el resultado final):

| Requisito | Umbral WCAG | Regla OKLCH aproximada |
|---|---|---|
| Texto normal (AA) | 4.5:1 | ΔL ≥ **0.45** entre texto y fondo cuando el fondo es casi blanco (L ≥ 0.95); con fondo oscuro (L ≤ 0.2) el texto necesita L ≥ 0.72 |
| Texto grande ≥ 24px / 18.5px bold (AA) | 3:1 | ΔL ≥ **0.35** |
| Bordes, iconos, foco (AA no-texto) | 3:1 | ΔL ≥ **0.35** respecto al fondo adyacente |
| Texto normal (AAA) | 7:1 | ΔL ≥ **0.6** |

- El **croma casi no suma contraste**: un acento L 0.60 C 0.20 no pasa AA con texto blanco aunque
  "se vea fuerte". Para texto blanco encima, el acento debe bajar a L ≤ 0.53 (de ahí `brand.600`
  como `accent` en claro). Para texto oscuro encima, L ≥ 0.75 (de ahí `brand.300` en oscuro).
- `accent-ink` existe por esto: el color del texto sobre el acento cambia con el modo. No uses
  `text-white` fijo sobre `bg-accent`.
- `muted` sobre `paper`: en claro, L ≤ 0.47; en oscuro, L ≥ 0.70. Los grises "elegantes" de L 0.6
  fallan AA.
- `line` solo necesita 3:1 si delimita controles; para separadores decorativos puede ser más suave,
  pero entonces no es el único indicador de un borde interactivo.
- Mide siempre el resultado: `npm test` (axe) falla la build si un texto no cumple AA; además,
  Chrome DevTools > Inspect > Contrast muestra la relación con `light-dark()` resuelto en cada modo.
- Hueco de medio tono: un color L 0.55–0.70 **no sirve ni para texto blanco ni para texto negro**.
  Si el acento de marca cae ahí, úsalo en superficies grandes y deriva un 600/300 para interacción.

## 6. Añadir un modo (p. ej. "high-contrast" o una segunda marca)

`light-dark()` solo admite dos modos. Para un tercero, el kit usa variables sobrescritas por selector:

1. En `tokens.json`, añade el valor al token: `"kit.modes": { "light": …, "dark": …, "hc": "{color.neutral.0}" }`.
   El generador ignora claves distintas de `light`/`dark` (no falla), así que el archivo sigue
   siendo la única fuente de verdad.
2. Genera el bloque `hc` con un script corto o a mano fuera de los marcadores, en `@layer base`:
   ```css
   :root[data-theme="hc"] { --color-ink: oklch(0% 0 0); --color-paper: oklch(100% 0 0); --color-line: oklch(0% 0 0); }
   ```
   Como las clases Tailwind leen `var(--color-ink)`, la sobrescritura se propaga a todo.
3. Para una **segunda marca** (multi-tenant), no uses modos: crea `brand-b.tokens.json` que solo
   redefina `color.brand` y `semantic`, y genera un `global.css` por marca. Mantén `font`, `text`,
   `spacing` idénticos salvo que la marca B tenga brief propio.

## 7. Qué NO hace el script (deliberado)

- No genera clases ni `@utility`; eso vive en `global.css` fuera de los marcadores.
- No convierte entre espacios de color ni comprueba gamut/contraste: hazlo al diseñar (§5) y deja
  que `npm test` lo verifique en la build.
- No soporta `$type` compuestos `typography`, `border`, `gradient`, `transition` del DTCG: el kit
  prefiere tokens atómicos + utilidades. Si una herramienta externa los exporta, descompónlos.
- No lee `$extensions` ajenas (Figma/Tokens Studio); se ignoran sin error.
