# Doctrina de diseño del kit: contra el "sitio genérico de IA"

**Última verificación: 2026-10-07.** Lee esto ANTES de escribir tokens o componentes. Inspirado en la
guía de diseño frontend de Anthropic (espíritu, no copia): el cliente ya rechazó propuestas que parecían
plantilla y paga por un punto de vista. Cada elección (paleta, tipo, layout) debe poder justificarse
con una frase que mencione al cliente real; si la justificación sirve para cualquier otro cliente,
es un default, no una decisión.

## 1. Las señales que delatan un sitio generado (tells)

Ninguna es ilegal; todas aparecen *independientemente del brief*, y eso es lo que las delata. Si el
brief pide una, úsala. Si la has puesto tú "porque sí", quítala.

**Tipografía**
- Inter (o Geist/DM Sans/Manrope) en todo, display y texto, sin razón.
- Una sola palabra del titular en cursiva, color o degradado; el resto neutro.
- Eyebrow en ALL-CAPS con tracking abierto encima de cada bloque, aunque el contenido no lo pida.
- Serif de display ultra-contrastada + crema cálido + acento terracota (combinación hoy saturada).
- Monoespaciada para "datos pequeños" y metadatos unidos con puntos medios (`A · B · C`).
- Flecha `→` pegada a todos los enlaces y botones.

**Color**
- Degradado violeta→azul (o rosa→naranja) como "identidad".
- Fondo casi negro tintado (#0B0B0B / #111) con un único acento ácido (verde lima, bermellón).
- Grises neutros puros (`C 0`) mezclados con una marca cálida: paleta "lavada".
- Tarjetas de cristal (`backdrop-blur` + borde blanco 10 %) sobre blobs difuminados.

**Layout**
- Hero centrado: titular + subtítulo + dos botones + imagen flotante; después "3 tarjetas de
  features con icono", "logos de clientes", "carrusel de testimonios", "CTA final en banda de color".
- Todo en tarjetas: contenido picado en cajas idénticas con `rounded-2xl` y la misma sombra gris.
- Un solo radio para todo (botón, tarjeta, imagen, modal). Hairlines + radio 0 + columnas de
  periódico como "editorial" por defecto.
- Numeración 01/02/03 en contenido que no es secuencia.
- Secciones de altura uniforme, mismo padding, misma estructura "título centrado + grid".

**Imagen e iconografía**
- Emojis como iconos. Iconos de línea genéricos (rayo, escudo, cohete) sin relación con el oficio.
- Ilustración 3D "corporate Memphis" o blobs abstractos como foto de marca.
- Mockups de dispositivo flotando en isométrica.

**Copy**
- "Soluciones integrales", "seamless", "cutting-edge", "lleva tu negocio al siguiente nivel",
  "potencia tu…", "revoluciona…". Tres beneficios siempre en tríada. Testimonios inventados con
  nombre + foto de stock. Cifras redondas sin fuente ("+500 clientes").

**Movimiento**
- Fade-and-slide-up en cada sección al hacer scroll + hover-lift en cada tarjeta + contador
  animado + marquee de logos: la "sopa de efectos".

## 2. Contramedidas: lista que se ejecuta ANTES de construir

Marca cada punto por escrito (en el plan de diseño del proyecto, p. ej. `DESIGN.md`) antes de
tocar `tokens.json` o un componente. Si no puedes marcar uno, pregunta al cliente; no lo rellenes.

- [ ] **Sujeto concreto**: qué vende, a quién, qué debe hacer la persona al llegar (una frase).
- [ ] **Tres adjetivos del brief** (no inventados) → dirección estética elegida de §3 y por qué.
- [ ] **Tokens derivados del brief**: matiz de color sacado del mundo del cliente (material,
  producto, lugar, logo existente); tipografía elegida por carácter, no por costumbre. Escrito en
  `design.tokens.json` (ver `tokens-dtcg.md`).
- [ ] **Arquitectura de información desde el contenido real**: inventario de lo que el cliente ha
  dado (servicios, precios, fotos, horarios, equipo, FAQs reales). El mapa de páginas y secciones
  sale de ese inventario, nunca de la plantilla "hero + features + testimonios + CTA". Si un bloque
  no tiene contenido real, no existe.
- [ ] **Un momento de layout firma**: una sola decisión compositiva memorable (titular que rompe la
  rejilla, tabla de precios tipográfica, galería a sangre, índice lateral fijo, imagen recortada
  por el texto). Todo lo demás, quieto y disciplinado.
- [ ] **Una idea de movimiento por página**, elegida y justificada (ver `assets/motion-examples/`).
  Todo movimiento no solicitado por el usuario va dentro de `prefers-reduced-motion: no-preference`.
- [ ] **Copy real o `PLACEHOLDER` explícito**: nada de cifras, nombres, testimonios ni logos
  inventados. El texto que falta se marca `PLACEHOLDER: <qué pedir al cliente>`.
- [ ] **Estructura = información**: cada borde, número, etiqueta o divisor codifica algo
  (secuencia, jerarquía, agrupación). Si solo decora, se quita.
- [ ] **Jerarquía de radios y sombras**: valores distintos por nivel (control / tarjeta /
  contenedor), definidos en tokens, nunca un único `rounded-*` global.
- [ ] **Autocrítica con captura**: tras el primer build, captura a 390px y 1280px (Playwright o
  navegador), pásala por la rúbrica de §4 y escribe qué cambias. "Quita un accesorio" antes de
  entregar.
- [ ] **Piso de calidad silencioso**: AA de contraste, foco visible, un `<h1>`, responsive hasta
  360px, reduced-motion, `lang="es"`. No se anuncia en el diseño; simplemente se cumple.

## 3. Seis direcciones estéticas con receta de tokens

Todas las fuentes existen como `@fontsource-variable/<slug>` 5.3.x (verificado con `npm view`
el 2026-10-07) y se cargan con `fontProviders.local()` como en el template. Las semillas de color
son puntos de partida: ajusta L/C/H al cliente, nunca las copies tal cual a dos proyectos.

| Dirección | Display / Texto (`@fontsource-variable/`) | Semilla OKLCH (acento · papel · tinta) | Radio / espaciado | Movimiento | Encaja con |
|---|---|---|---|---|---|
| **Editorial serif** | `newsreader` (opsz, itálica real) / `source-serif-4` o `literata` | acento `oklch(45% 0.12 25)` granate · papel `oklch(97% 0.01 90)` · tinta `oklch(22% 0.02 50)` | radio 0–2px; márgenes generosos, columnas asimétricas 5/7, reglas finas solo donde separan secciones reales | casi nulo: una regla que se dibuja, cursivas que entran con el titular | medios, consultoras, abogados, bodegas, editoriales, biografías profesionales |
| **Industrial grotesk** | `archivo` (ejes wdth+wght; display condensado o expandido) / `archivo` o `work-sans` | acento `oklch(62% 0.18 40)` naranja seguridad · papel `oklch(93% 0.01 95)` gris cemento · tinta `oklch(18% 0.01 260)` | radio 0–4px; rejilla visible, bloques densos, tipografía grande con `font-stretch` | movimiento mecánico: duraciones cortas (120–200 ms), `ease-in-out` lineal, sin rebotes | talleres, logística, construcción, manufactura, parking, servicios técnicos |
| **Warm craft** | `fraunces` (`SOFT`, `WONK`) / `nunito-sans` o `commissioner` | acento `oklch(58% 0.14 70)` miel/arcilla · papel `oklch(96% 0.02 80)` · tinta `oklch(28% 0.04 55)` | radios medios y variados (6/12/20px); espaciado amplio, bordes dobles o punteados | suave y lento (400–700 ms), `ease-out-expo`, una ilustración o textura que respira | panaderías, cafés, artesanía, floristerías, clínicas de bienestar, educación infantil |
| **Precision / technical** | `geist` o `ibm-plex-sans` / mismo + `jetbrains-mono` o `geist-mono` solo para datos reales | acento `oklch(55% 0.17 250)` azul instrumento · papel `oklch(99% 0 0)` · tinta `oklch(15% 0.01 250)`; grises casi neutros permitidos | radio 2–6px uniforme en controles, 0 en tablas; `tabular-nums`, retículas de 8px estrictas | funcional: solo transiciones de estado (`duration-fast`), nada de scroll-reveal | SaaS B2B, ingeniería, fintech, laboratorios, dashboards de marketing |
| **Luxury quiet** | `cormorant-garamond` (display ligero, grande) / `figtree` o `hanken-grotesk` en gris cálido | acento `oklch(35% 0.05 60)` bronce oscuro · papel `oklch(98% 0.005 70)` o `oklch(14% 0.01 60)` en oscuro · tinta `oklch(20% 0.01 60)` | radio 0; espaciado extremo (sección ≥ 10rem), texto pequeño con tracking +0.02em, imágenes a sangre | mínimo: fundidos lentos (700–1000 ms) en imágenes, nada en texto | inmobiliaria premium, joyería, hoteles boutique, estudios de arquitectura, alta gastronomía |
| **Bold civic** | `bricolage-grotesque` o `big-shoulders-display` / `public-sans` o `atkinson-hyperlegible-next` | acento `oklch(50% 0.20 290)` violeta cívico o `oklch(60% 0.19 30)` rojo · papel `oklch(97% 0.01 100)` · tinta `oklch(18% 0.02 290)` | radio 4–8px; bloques de color planos a tamaño completo, tipografía enorme (`text-display` ≥ 8rem), rejilla de 6 columnas | enérgico y breve (200–300 ms), entradas en bloque, sin parallax | ONG, campañas, eventos, cooperativas, escuelas, servicios municipales, sindicatos |

Reglas de uso:
- Elige **una** dirección por proyecto y escribe en `DESIGN.md` por qué encaja con los tres adjetivos.
- Puedes mezclar una fuente de otra dirección si el brief lo justifica (p. ej. taller familiar =
  Industrial con acento de Warm craft). Nunca mezcles dos paletas.
- El template viene con Fraunces + Inter: es el placeholder. Cámbialo salvo que la dirección
  Warm craft sea la elegida, y aun así reconsidera Inter.
- Si el cliente ya tiene logo y colores, la dirección se **deriva** de ellos; no se impone.

## 4. Rúbrica de crítica (10 sí/no) — la usa la skill `design-critique`

Captura a 390px y 1280px, modo claro y oscuro. Responde cada pregunta con sí/no y una línea de
evidencia. Menos de 8 "sí" → vuelve al plan, no al CSS.

1. ¿Puedo decir en una frase qué vende este cliente mirando solo el hero (sin leer el `<title>`)?
2. ¿La tipografía display se eligió para este cliente (y no es Inter/Geist/DM Sans por defecto)?
3. ¿La paleta nace de un matiz del mundo del cliente y los neutros comparten ese matiz?
4. ¿Existe exactamente **un** momento de layout firma, y el resto está quieto?
5. ¿Hay como máximo una idea de movimiento por página, y la página es legible sin ella?
6. ¿Cada tarjeta, borde, número y etiqueta codifica información real (no decora)?
7. ¿Los radios y sombras varían por jerarquía (control ≠ tarjeta ≠ contenedor)?
8. ¿Todo el texto es del cliente o está marcado `PLACEHOLDER` (cero cifras/testimonios inventados)?
9. ¿Pasa AA (axe en `npm test`), foco visible, un solo `<h1>`, sin scroll horizontal a 360px?
10. Prueba del espejo: ¿he quitado al menos un elemento decorativo desde la primera versión?

## 5. Qué hacer cuando el brief es pobre

No rellenes con defaults. Propón al cliente, por escrito y en una sola pasada: sujeto, audiencia,
acción principal, tres adjetivos, dirección estética de §3 y un inventario de contenido que
necesitas (fotos reales, servicios con precio, datos de contacto). Hasta que responda, construye
con `PLACEHOLDER` visibles y la dirección provisional marcada como tal en `DESIGN.md`.
