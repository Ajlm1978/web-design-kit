# Motion — política de movimiento del kit

**Última verificación: 2026-10-07** con `motion 14.0.0`, `gsap 3.15.0`, `lenis 1.3.26`
sobre la plantilla `templates/astro-marketing` (Astro 7.3.7 + Tailwind 4.3.3 + React 19.3):
`astro check` 0 errores, `astro build` OK. Snippets listos para copiar en `assets/motion/`.

## Doctrina en una frase

**Una idea de movimiento por página, la técnica más barata que la consiga, visible por
defecto, y nada que el usuario no haya pedido.** El movimiento es ortografía, no contenido:
si quitarlo no rompe nada, está bien hecho; si quitarlo deja la página en blanco, está mal.

## Orden de prioridad (de más barato a más caro)

Elige el primer nivel que resuelva el efecto. Bajar de nivel requiere una razón escrita en el
brief del cliente ("scrollytelling expresivo", "producto con gestos"), no "porque queda bonito".

| # | Técnica | Coste JS | Soporte (oct 2026) | Para qué |
|---|---|---|---|---|
| 1 | **Transiciones CSS + `@starting-style`** | 0 KB | Baseline (`@starting-style`, `allow-discrete`, Popover API) | Hover/focus, entrada-salida de `<dialog>`, `[popover]`, menú móvil, toasts, acordeones |
| 2 | **View Transitions entre documentos** | 0 KB | Chrome/Edge, Safari 18.2+; Firefox pendiente → mejora progresiva | Navegación entre páginas, header persistente, hero que "viaja" al detalle |
| 3 | **Scroll-driven animations** | 0 KB | **NO Baseline**: Chrome/Edge 115+, Safari 26+, Firefox tras flag → siempre con `@supports` | Reveal al scroll, línea que se dibuja, paralaje sutil |
| 4 | **`motion` v14 en islas React** | ~18–22 KB gz + React | Todo | Gestos (drag, hover con spring), `layout` animations, listas reordenables, `AnimateView` |
| 5 | **GSAP 3.15 + ScrollTrigger (+ SplitText)** | ~45 KB gz | Todo | Scrollytelling con pin, timelines encadenadas, texto por líneas. Preset "expresivo", opt-in |
| 6 | **Lenis** (smooth scroll) | ~6 KB gz + rAF permanente | Solo `pointer: fine` | Nunca por defecto. Solo si el scrollytelling GSAP exige inercia y el cliente lo pide |

En Astro estático los niveles 1–3 no añaden ni un byte de JS: la página sigue siendo HTML.
Los niveles 4–6 se cargan **siempre** con `client:visible` o `import()` dinámico, nunca en el
bundle inicial.

## Decisión rápida: efecto → técnica más barata

| Quiero… | Usa | Snippet |
|---|---|---|
| Hover/focus suave en botones, enlaces, tarjetas | `transition` CSS (`.transition-soft` de la plantilla) | `templates/…/motion.css` |
| Abrir/cerrar modal, menú móvil, tooltip, toast | `<dialog>` / `[popover]` + `@starting-style` | `starting-style.css` |
| Que la cabecera no "parpadee" al cambiar de página | `@view-transition` + `view-transition-name: site-header` | `view-transitions.css` |
| Que la imagen/título del hero viaje a la página de detalle | `view-transition-name` único por página | `view-transitions.css` |
| Texto/tarjetas que aparecen al hacer scroll | `animation-timeline: view()` con guardas | `reveal.css` |
| Línea que se dibuja, barra de progreso de lectura | `animation-timeline: view()` / `scroll(root)` | `reveal.css` (`.rule-draw`) |
| Paralaje sutil en una imagen | `animation-timeline: scroll(root)` (`.hero-media` de la plantilla) | `templates/…/motion.css` |
| Contador que sube, lista con stagger **dentro de una isla React** | `motion/react` (`whileInView`, `animate`) | `MotionReveal.tsx`, `MotionStats.tsx` |
| Arrastrar, reordenar, cambiar de tamaño con spring | `motion/react` (`drag`, `layout`) | — |
| Transición entre vistas dentro de una isla (tabs, filtros) | `AnimateView` de `motion/react-animate-view` | — |
| Sección fija mientras avanzan pasos; texto por líneas | GSAP ScrollTrigger `pin` + SplitText | `gsap-scrollytelling.ts` |
| Scroll con inercia | Lenis, opt-in, con 3 guardas | `lenis-optin.ts` |
| Preloader, cortina de entrada, "cargando…" | **Nada.** Prohibido (ver anti-patrones) | — |

## Contrato reduced-motion (obligatorio)

`prefers-reduced-motion: reduce` no es "sin animaciones": es "sin movimiento". El contrato:

**Se desactiva por completo**
- Todo lo atado al scroll (niveles 3, 5, 6): paralaje, reveals por scroll, pin, smooth scroll.
  Son los que provocan mareo vestibular.
- Desplazamientos (`translate`, `y`, `x`), escalas, rotaciones, springs con rebote.
- Stagger/escalonado (el contenido aparece a la vez).
- Animaciones de View Transitions (`::view-transition-*{ animation: none }`).
- Autoplay de vídeo decorativo y marquesinas.

**Se mantiene**
- Fades de opacidad **cortos** (≤ 150 ms) que comunican "algo apareció" (modal, toast).
- Cambios de color/fondo/borde en hover y focus (no son movimiento).
- Indicadores de progreso funcionales (barra de carga de un formulario).
- Transición instantánea entre páginas (la navegación sigue funcionando, solo sin crossfade).

**Cómo se implementa, por nivel**
- CSS: todo lo animado va dentro de `@media (prefers-reduced-motion: no-preference)`; el
  estado base, fuera, es el estado final. Nunca `opacity: 0` sin esa guarda.
- `motion`: `useReducedMotion()` → `initial={false}` y transiciones `{ duration: 0 }`.
- GSAP: `gsap.matchMedia().add({ motionOk: '(prefers-reduced-motion: no-preference)' }, …)`
  y `if (!motionOk) return;`. GSAP revierte el DOM solo si la preferencia cambia en vivo.
- Lenis: no se instancia (`canUseLenis()` devuelve `false`) y además `respectReducedMotion: true`.

## Reglas de rendimiento (INP / LCP / CLS)

1. **Solo propiedades del compositor**: `transform` (o `translate`/`scale`/`rotate`),
   `opacity`, `filter`, `clip-path`. Nunca `top/left/width/height/margin/padding` ni
   `box-shadow` animado (usa una pseudo-capa con `opacity`).
2. **Sin layout thrash**: no leer `getBoundingClientRect`/`offsetTop` en callbacks de scroll
   ni dentro de `onUpdate`. ScrollTrigger ya cachea; `view()` ni siquiera toca el hilo principal.
3. **`will-change` con disciplina**: no lo pongas en CSS estático. `motion` lo aplica y retira
   solo durante la animación; GSAP tiene `force3D`. Cada `will-change` permanente es una capa
   de GPU que come memoria en móvil.
4. **Presupuesto**: ≤ 30–50 KB gz de JS de movimiento por página, medido en `dist/_astro`
   (`gzip -c chunk.js | wc -c`). Medido en la plantilla: `motion/react` ≈ 20 KB (lo trae la
   isla), chunk GSAP+ScrollTrigger+SplitText ≈ 47 KB, Lenis ≈ 5.6 KB. Es decir: **GSAP agota
   el presupuesto solo**; una página con GSAP no lleva además Lenis ni `motion` salvo que
   el brief lo justifique.
5. **LCP intocable**: nada anima el elemento LCP (titular/imagen del hero) con JS antes de
   pintar. La plantilla usa CSS puro (`.marquee-rule`, `.hero-media`) y el titular es HTML
   plano. Un reveal del hero con `opacity: 0` inicial **retrasa el LCP** porque el navegador
   no cuenta el elemento hasta que es visible.
6. **Carga diferida**: islas con `client:visible`; GSAP/Lenis con `import()` disparado por
   `IntersectionObserver` o desde un `useEffect`. Verificado: el chunk GSAP no aparece en
   `index.html` hasta que la isla hidrata.
7. **CLS cero**: `SplitText` con `autoSplit: true` (re-divide al cargar la fuente) y
   `mask: 'lines'`; `pin` con `anticipatePin: 1`; `view-transition` de imágenes con
   `object-fit: cover` para evitar estiramientos.
8. **Duraciones**: 160 ms (micro), 320 ms (UI), 600–900 ms (entradas de contenido). Nada por
   encima de 1 s salvo scroll-driven, cuya duración la fija el usuario con el dedo.

## "Una idea de movimiento por página"

Cada página tiene **una** idea "firma" (la regla que se dibuja bajo el titular, la imagen que
viaja al detalle, el texto que se revela por líneas en el manifiesto) y el resto es ortografía
básica (hover, foco, modal). Si en la revisión aparecen dos ideas compitiendo, se quita la más
cara. Señales de que te has pasado: hay más de un `@keyframes` propio por página además de
`reveal-up`; hay stagger en más de una sección; el usuario ve algo moverse antes de leer el H1.

## Anti-patrones (bloquean la entrega)

| Anti-patrón | Por qué | Alternativa |
|---|---|---|
| Preloader / cortina / logo animado antes del contenido | Retrasa LCP y FCP a propósito; Lighthouse lo penaliza; el usuario ya vio la web en el buscador | Nada. El HTML estático de Astro ya pinta en < 1 s |
| `opacity: 0` en el CSS base esperando a que JS lo revele | Si JS falla, tarda o el bot no ejecuta JS, la página está vacía; rompe el LCP | Estado base visible; animar solo dentro de `@supports`/`@media` o con `initial` tras hidratar |
| Scroll-jacking (Lenis por defecto, `wheel` interceptado, secciones que "atrapan") | Rompe la velocidad nativa, find-in-page, anclas, lectores de pantalla; mareo | Lenis solo opt-in con guardas; scroll-snap CSS si hace falta "pasos" |
| Animar todo (cada tarjeta, cada icono, cada párrafo) | Ruido; INP sube; parece plantilla | Una idea firma + `.reveal` en ≤ 3 bloques por página |
| Animar `height`, `width`, `top`, `box-shadow` | Reflow en cada frame; jank en móvil | `transform`/`opacity`; `grid-template-rows: 0fr→1fr` para acordeones |
| `will-change` global o en `*` | Memoria GPU, texto borroso | Dejar que la librería lo gestione |
| Stagger largo (> 80 ms por hijo) o delays > 300 ms | El usuario espera a que termine para leer | ≤ 80 ms por hijo, máximo 6 hijos escalonados |
| Dos `view-transition-name` iguales en una página | Aborta toda la transición (salto brusco) | Nombres únicos; en listados, `card-${slug}` o `match-element` |
| `<ClientRouter/>` "por si acaso" | 5–6 KB gz y JS en cada navegación sin necesidad | `@view-transition { navigation: auto }` (CSS puro) |
| Importar `framer-motion` o `@studio-freight/lenis` | Paquetes obsoletos/deprecados | `motion` y `lenis` |

## Detalles por nivel

### 1. Transiciones CSS y `@starting-style`
`@starting-style` define desde dónde arranca la transición la primera vez que un elemento se
pinta (entrada); `transition-behavior: allow-discrete` sobre `display` y `overlay` permite
animar la salida de `<dialog>`/`[popover]` sin JS. El foco, Esc y click-fuera los gestiona el
navegador (`showModal()`, `popover="auto"`). Ver `starting-style.css`. Tailwind 4.3 compila
`@starting-style` sin plugin (verificado en el build).

### 2. View Transitions entre documentos
Astro estático es multipágina. `@view-transition { navigation: auto }` en CSS activa el
crossfade entre páginas del mismo origen; Firefox lo ignora sin romper nada. Nombra con
`view-transition-name` solo el header (persistente), el título y la imagen del hero (uno de
cada por página). `<ClientRouter/>` (`astro:transitions`) existe en `Base.astro` bajo la prop
`clientRouter`, desactivado: actívalo solo si necesitas estado vivo entre páginas (audio,
carrito). Las View Transitions en el mismo documento (`document.startViewTransition`) son
Baseline; dentro de una isla React usa `AnimateView` (nivel 4) en vez de llamarlas a mano.

### 3. Scroll-driven animations
`animation-timeline: view()` liga el progreso de la animación a la posición del elemento en el
viewport; `scroll(root)` al scroll del documento. Corre fuera del hilo principal. Como no es
Baseline, el patrón es estricto: estado final fuera; dentro de
`@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) { … } }`
la animación con `animation-range`. El escalonado se hace desplazando el `animation-range`,
no con `animation-delay` (el scroll es la línea de tiempo). Ver `reveal.css`.

### 4. `motion` v14 (React)
```ts
import { motion, useReducedMotion, animate, useInView } from 'motion/react';
import { AnimateView } from 'motion/react-animate-view'; // entry aparte; React 19.3+
```
`AnimateView` **no** se exporta desde `motion/react` (verificado en 14.0.0): vive en
`motion/react-animate-view`. Úsalo para enter/exit/shared entre estados de una isla (tabs,
filtros de galería). Patrón de isla: `useReducedMotion()` → `initial={false}` si reduce;
`whileInView` + `viewport={{ once: true, amount: 0.35 }}`; solo `opacity`/`x`/`y`/`scale`.
Evita `layout` en listas largas (mide cada hijo por frame). Ver `MotionReveal.tsx` y el
`MotionStats.tsx` de la plantilla.

### 5. GSAP 3.15 + ScrollTrigger + SplitText (preset "expresivo")
```ts
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(ScrollTrigger, SplitText);
```
Gratis incluidos los plugins (antes "Club"). Types incluidos en el paquete (`gsap/types`).
Siempre dentro de `gsap.matchMedia()` con una condición `motionOk`; `SplitText.create(el,
{ type: 'lines', mask: 'lines', aria: 'auto', autoSplit: true, onSplit })`. `pin` solo en
escritorio (en móvil roba pantalla). Cargar con `import()` dinámico. Devuelve `destroy()`
(`mm.revert()`) para islas que se desmontan. Ver `gsap-scrollytelling.ts`.

### 6. Lenis (opt-in)
```ts
import Lenis from 'lenis';
```
Tres guardas antes de instanciar: `no-preference`, `(pointer: fine)` y ausencia de
`?nosmooth`. `autoRaf: false` para controlar el bucle y pararlo en `destroy()`;
`syncTouch: false`; `anchors: true`; `respectReducedMotion: true`. Si convive con
ScrollTrigger, `lenis.on('scroll', ScrollTrigger.update)`. Añade el CSS de Lenis
(`html.lenis…`) a `global.css` solo cuando lo actives. Ver `lenis-optin.ts`.

## Cómo usar los snippets de `assets/motion/`

| Archivo | Destino en el proyecto | Activación |
|---|---|---|
| `reveal.css` | `src/styles/motion/` | `@import "./motion/reveal.css"` en `global.css`. La plantilla ya trae lo mismo en `motion.css`: no dupliques |
| `view-transitions.css` | `src/styles/motion/` | `@import`; borra el bloque `@view-transition` de `global.css` y añade clases `vt-*` al header/hero |
| `starting-style.css` | `src/styles/motion/` | `@import`; clases `.modal`, `.pop-sheet`, `.pop-toast` |
| `MotionReveal.tsx` | `src/components/islands/` | `<MotionReveal client:visible as="ul">…</MotionReveal>` |
| `gsap-scrollytelling.ts` | `src/scripts/` | `npm i gsap`; `import()` desde `<script>` o `useEffect` |
| `lenis-optin.ts` | `src/scripts/` | `npm i lenis`; `import('../scripts/lenis-optin').then(m => m.initLenis())` |

Checklist antes de entregar: (1) desactivar JS → todo visible; (2) activar reduced-motion en el
SO → nada se desplaza, la web funciona; (3) Firefox → navegación y reveals estáticos, sin
errores; (4) `gzip` de los chunks de movimiento ≤ 50 KB; (5) Lighthouse: LCP sin regresión
frente a la versión sin movimiento.
