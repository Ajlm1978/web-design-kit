# Accesibilidad — WCAG 2.2 AA esencial + European Accessibility Act (EAA)

Referencia de trabajo para sitios de marketing. No sustituye una auditoría profesional;
cubre lo que un sitio del kit **debe** cumplir y lo que la ley europea exige a quien
vende en la UE.

## 1. Marco normativo (resumen honesto)

| Norma | Estado (oct 2026) | Qué implica |
|---|---|---|
| **WCAG 2.2** (W3C Recommendation, oct 2023) | Vigente. Es la referencia técnica que citan las leyes | Objetivo del kit: **nivel AA** completo |
| **WCAG 2.1** | Sigue siendo la base de EN 301 549 v3 | Todo 2.1 AA está incluido en 2.2 AA (2.2 añade 9 criterios y retira 4.1.1 Parsing) |
| **WCAG 3.0** | **Working Draft**. No es estándar final ni exigible legalmente | No diseñar "para WCAG 3"; seguir 2.2 AA |
| **EN 301 549** | Norma europea armonizada; referencia a WCAG 2.1 AA (v3.2.1). Actualización para EAA/2.2 en curso | Cumplir 2.2 AA cubre con margen |
| **EAA — Directiva (UE) 2019/882** | Aplica desde el **28 de junio de 2025** | Ver §3 |

## 2. WCAG 2.2 AA — lo esencial para un sitio de marketing

Cada punto indica criterio, qué hacer y cómo lo cubre (o no) el template.

### 2.1 Foco visible (2.4.7 AA, 2.4.11 Focus Not Obscured AA — nuevo en 2.2)
- Todo elemento interactivo muestra un indicador de foco con contraste ≥ 3:1 frente al fondo
  y frente a su propio estado sin foco. Usa `:focus-visible`, nunca `outline: none` sin reemplazo.
- Headers sticky, cookie banners y toasts **no pueden tapar** el elemento enfocado. Si hay header
  fijo, añade `scroll-padding-top` en `html` igual a su altura.
- Template: `global.css` define `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`.

### 2.2 Tamaño del objetivo (2.5.8 Target Size Minimum, AA — nuevo en 2.2)
- Objetivos táctiles de **≥ 24×24 px CSS** o con **24 px de separación** entre centros. Excepciones:
  enlaces en línea dentro de un párrafo, controles nativos sin estilo, y cuando el usuario puede
  usar otro control equivalente.
- Práctica del kit: botones y enlaces de nav **≥ 44×44 px** en móvil (recomendación AAA 2.5.5; cuesta
  nada y evita discusiones). Iconos sueltos: `min-height/min-width: 44px` + `inline-flex` centrado.

### 2.3 Contraste (1.4.3 texto AA, 1.4.11 no-texto AA)
- Texto normal ≥ **4.5:1**; texto grande (≥ 24 px o ≥ 18.66 px bold) ≥ **3:1**; iconos y bordes de
  controles ≥ **3:1**. En **ambos** esquemas light y dark.
- Texto sobre imagen: nunca sin overlay o sin medir sobre la zona más clara de la foto.
- Tokens OKLCH del template: `--color-muted` está calibrado a ≥ 4.5:1 sobre `--color-paper`;
  si cambias la paleta, re-mide con https://www.oklch.com + la herramienta de contraste de DevTools.
- Comprobación automática: axe (`color-contrast`) en los tests; falso negativo típico: texto sobre
  gradiente → medir a mano.

### 2.4 Movimiento reducido (2.3.3 Animation from Interactions, AAA — pero exigible por sentido común y por 2.2.2 Pause/Stop/Hide AA)
- Respeta `prefers-reduced-motion: reduce`: desactiva parallax, scroll-jacking, autoplay y cualquier
  desplazamiento > fade. Las animaciones en `motion.css` del template viven dentro de
  `@media (prefers-reduced-motion: no-preference)`.
- Islas React con `motion`: usa `useReducedMotion()` o `<MotionConfig reducedMotion="user">`.
- Nada parpadea más de 3 veces/segundo (2.3.1 A).
- Carruseles/vídeos que se mueven > 5 s necesitan botón de pausa visible (2.2.2 AA).

### 2.5 Skip link y orden de foco (2.4.1 Bypass Blocks A, 2.4.3 Focus Order A)
- Primer elemento enfocable: `<a href="#contenido" class="skip-link">Saltar al contenido</a>`,
  visible al recibir foco. El `<main id="contenido" tabindex="-1">` recibe el foco.
- Orden de tabulación = orden visual. Nada de `tabindex` > 0.

### 2.6 Landmarks y estructura (1.3.1 Info and Relationships A, 2.4.6 Headings and Labels AA)
- Un solo `<main>`; `<header>`, `<nav aria-label="Principal">`, `<footer>`. Si hay dos `<nav>`,
  ambos con `aria-label` distinto.
- Un único `<h1>` por página; jerarquía sin saltos (h2 → h3, no h2 → h4).
- Idioma: `<html lang="es">` (3.1.1 A). Fragmentos en otro idioma: `lang="en"` en el elemento.
- Imágenes: `alt` descriptivo o `alt=""` si es decorativa (1.1.1 A). Logos: `alt="Nombre de la empresa"`.

### 2.7 Formularios (1.3.5 Identify Input Purpose AA, 3.3.1–3.3.4 A/AA, 3.3.7 Redundant Entry A — nuevo en 2.2, 3.3.8 Accessible Authentication AA — nuevo en 2.2)
- Cada `<input>` con `<label for>` visible (no solo `placeholder`). `autocomplete` correcto
  (`name`, `email`, `tel`, `organization`).
- Errores: texto junto al campo, `aria-describedby` apuntando al mensaje, `aria-invalid="true"`,
  y un resumen al inicio del formulario con foco si falla el envío. Color **no** es el único indicador.
- Campos obligatorios: `required` + indicación textual ("obligatorio"), no solo asterisco rojo.
- No pedir dos veces el mismo dato en un mismo proceso (3.3.7). No CAPTCHA cognitivo (3.3.8):
  usa honeypot + Turnstile/hCaptcha en modo invisible.
- Botón de envío con texto real ("Enviar consulta"), no "Enviar" genérico si hay varios formularios.

### 2.8 Diálogos y menús (4.1.2 Name, Role, Value A; 2.1.2 No Keyboard Trap A)
- Usa el **`<dialog>` nativo** con `dialog.showModal()`: gestiona foco, `Esc`, `inert` del fondo y
  `aria-modal` sin librerías. Dale `aria-labelledby` al título. Devuelve el foco al disparador al cerrar
  (el navegador lo hace si abriste con `showModal()`).
- Menú móvil: botón `<button aria-expanded="false" aria-controls="menu-movil">` con texto o
  `aria-label="Abrir menú"`; el panel es un `<dialog>` o un `<nav>` que se muestra/oculta con `hidden`.
- Nunca `div` clicable: `<button>` o `<a href>`. Si es un enlace que abre en pestaña nueva, avísalo en
  texto o `aria-label` ("(se abre en una ventana nueva)").

### 2.9 Otros que fallan a menudo
- **Zoom 200 %** sin pérdida de contenido ni scroll horizontal (1.4.4 AA, 1.4.10 Reflow AA a 320 px).
- **Espaciado de texto** (1.4.12 AA): el layout aguanta `line-height: 1.5`, `letter-spacing: 0.12em`,
  `word-spacing: 0.16em` — nada de alturas fijas en tarjetas con texto.
- **Hover/focus content** (1.4.13 AA): tooltips descartables con `Esc` y que no desaparecen al mover
  el ratón hacia ellos.
- **Drag** (2.5.7 Dragging Movements AA — nuevo en 2.2): si algo se arrastra (slider, carrusel), debe
  poder hacerse con clic/teclado.
- **Ayuda consistente** (3.2.6 Consistent Help A — nuevo en 2.2): el enlace de contacto/chat está en
  el mismo sitio en todas las páginas.

### 2.10 Comprobación
- Automática: `npm test` (axe con tags `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`) a 375/768/1280,
  light y dark. Detecta ~30–40 % de los problemas reales; el resto es manual.
- Manual mínimo (15 min): recorrer la home solo con teclado (Tab/Shift+Tab/Enter/Esc), zoom 200 %,
  reduced-motion, lector de pantalla en una página (VoiceOver en Safari o NVDA en Firefox).

## 3. European Accessibility Act (Directiva 2019/882)

> ⚠ **Hechos de fuente secundaria — re-verificar** antes de asesorar a un cliente. Los datos de
> esta sección proceden de resúmenes de la Comisión Europea y de despachos/organizaciones de
> accesibilidad, no de la lectura directa del texto consolidado ni de cada transposición nacional.
> La transposición varía por país (sanciones, autoridad de vigilancia, matices de alcance).

- **Qué es**: directiva que armoniza requisitos de accesibilidad para productos y servicios en la UE.
  Cada Estado miembro la transpuso a ley nacional (en España: Ley 11/2023).
- **Desde cuándo**: obligatoria para productos y servicios nuevos puestos en el mercado desde el
  **28 de junio de 2025**.
- **A quién afecta (servicios relevantes para el kit)**: **comercio electrónico** (cualquier web o app
  donde un consumidor pueda comprar/contratar a distancia), servicios bancarios, transporte de
  pasajeros, comunicaciones electrónicas, acceso a medios audiovisuales, libros electrónicos.
  Un sitio **puramente informativo** (sin venta ni contratación online) no entra como "servicio"
  bajo la EAA, aunque sí puede estar sujeto a normas nacionales anti-discriminación.
- **Vendedores fuera de la UE**: aplica si el servicio se **ofrece a consumidores en la UE**
  (p. ej. una tienda en Miami que vende y envía a España con precios en EUR y web en español).
- **Periodos transitorios**: los contratos de servicios firmados antes del 28/06/2025 pueden
  continuar sin cambios hasta el **28 de junio de 2030** como máximo; terminales de autoservicio
  hasta 20 años. Algunos resúmenes citan **2027** como fecha límite para determinados supuestos
  nacionales — verificar por país.
- **Exención de microempresas**: las **microempresas que prestan servicios** (< 10 empleados y
  ≤ 2 M€ de facturación/balance) están exentas de los requisitos de servicios. La exención **no**
  cubre a fabricantes/importadores de productos. Que el cliente sea micro no exime a su proveedor
  de pagos ni a la plataforma donde vende.
- **Qué exige técnicamente**: criterios funcionales del Anexo I, que en la práctica se demuestran
  cumpliendo **EN 301 549** → **WCAG 2.1 AA** (y, por seguridad, 2.2 AA). Más: información accesible
  sobre el servicio y **una declaración de accesibilidad publicada**.
- **Sanciones**: las fija cada Estado. En España, Ley 11/2023: multas que pueden superar los 600 000 €
  en infracciones muy graves (verificar importes vigentes).

### Qué hacer en un proyecto del kit
1. Preguntar al cliente: ¿vende o contrata online a consumidores de la UE? ¿Es microempresa?
2. Si aplica EAA: WCAG 2.2 AA completo (gates 3 y 5 de `quality-gates.md` + revisión manual),
   declaración de accesibilidad enlazada en el footer, canal de contacto para incidencias.
3. Documentar la fecha de la auditoría y conservar el informe.
4. Dejar claro por escrito que el kit entrega cumplimiento **técnico**; la evaluación jurídica
   la hace un abogado.

## 4. Plantilla de declaración de accesibilidad (español)

Página `/accesibilidad/` enlazada desde el footer. Sustituye los campos entre corchetes.

```markdown
# Declaración de accesibilidad

[NOMBRE LEGAL DE LA EMPRESA] se ha comprometido a hacer accesible su sitio web
[https://dominio.com] de conformidad con la Directiva (UE) 2019/882 (Acta Europea de
Accesibilidad) y su transposición nacional [p. ej. Ley 11/2023, de 8 de mayo, España], tomando
como referencia técnica las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.2, nivel AA.

## Situación de cumplimiento

Este sitio web es **[plenamente conforme / parcialmente conforme / no conforme]** con las WCAG 2.2
nivel AA [, debido a las excepciones que se indican a continuación].

## Contenido no accesible

[Si procede, enumerar: qué contenido, qué criterio incumple y por qué (carga desproporcionada,
contenido de terceros, contenido histórico). Si no hay excepciones, eliminar esta sección.]

- [Ejemplo: Los vídeos publicados antes de [fecha] no disponen de subtítulos. Criterio 1.2.2.
  Se están subtitulando progresivamente.]

## Preparación de esta declaración

Esta declaración fue elaborada el **[DD/MM/AAAA]**. El método empleado fue
**[autoevaluación / evaluación por un tercero: NOMBRE]**, que incluyó pruebas automáticas
(axe-core, Lighthouse) y revisión manual con teclado, zoom al 200 %, reducción de movimiento y
lector de pantalla [VoiceOver / NVDA].

Última revisión: **[DD/MM/AAAA]**.

## Observaciones y datos de contacto

Si encuentra una barrera de accesibilidad, necesita información en un formato alternativo o
quiere comunicarnos cualquier incidencia, escríbanos:

- Correo: [accesibilidad@dominio.com]
- Teléfono: [+34 000 000 000]
- Formulario: [https://dominio.com/contacto/]

Nos comprometemos a responder en un plazo máximo de **[20 días hábiles]**.

## Procedimiento de aplicación

Si tras contactar con nosotros no obtiene respuesta satisfactoria, puede dirigirse a la
autoridad de vigilancia competente: **[NOMBRE Y ENLACE DE LA AUTORIDAD NACIONAL — verificar por
país]**.
```

## 5. Fuentes para re-verificar
- W3C — WCAG 2.2: https://www.w3.org/TR/WCAG22/ · Novedades 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- W3C — WCAG 3.0 (Working Draft): https://www.w3.org/TR/wcag-3.0/
- Comisión Europea — EAA: https://ec.europa.eu/social/main.jsp?catId=1202
- Directiva 2019/882 (texto): https://eur-lex.europa.eu/eli/dir/2019/882/oj
- EN 301 549: https://www.etsi.org/deliver/etsi_en/301500_301599/301549/
- España, Ley 11/2023: https://www.boe.es/eli/es/l/2023/05/08/11
