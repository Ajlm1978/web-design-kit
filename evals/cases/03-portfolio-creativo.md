# Caso 03 — Portfolio creativo (fotógrafa / directora de arte)

## Prompt (pegar tal cual)

```
Soy Inés Carvallo, fotógrafa y directora de arte en Madrid, trabajo editorial y campañas de moda.
Quiero un portfolio que se sienta como una publicación, no como una plantilla de Squarespace:
mucho aire, tipografía con carácter, las fotos mandan. Secciones: trabajos (8 proyectos, cada uno
con 6-10 fotos y un texto corto), sobre mí, contacto. Modo oscuro de verdad, no invertir colores.
Que se pueda navegar con teclado porque un cliente mío es ciego parcial y me lo pidió. Español e
inglés más adelante; de momento solo español. Dominio inescarvallo.com.
```

## Respuestas a preguntas (si el agente pregunta)
- Fotos: 60 imágenes en bruto que aún no te ha pasado; usa placeholders marcados con las medidas
  exactas que necesitas (ratio y px) para que ella exporte.
- Nombres de los 8 proyectos: "Vogue España — Sal", "Loewe SS26 — Backstage", "Retrato: Ana",
  "Zara Home — Luz", "Tapiz", "Noche en Lavapiés", "El País Semanal — Oficios", "Paradores".
  Textos: 2–3 frases cada uno, tono sobrio; no inventes premios ni clientes adicionales.
- Contacto: hola@inescarvallo.com, Instagram @inescarvallo. Sin teléfono público.
- Animación: le gusta algo de movimiento sutil al pasar entre proyectos, pero "sin mareos".

## Artefactos esperados
- Proyecto Astro desde `templates/astro-marketing`.
- Páginas: `/` (índice de trabajos), `/trabajos/<slug>/` × 8, `/sobre-mi/`, `/contacto/`, `/404`.
- Galería por proyecto en HTML (`<figure>`/`<figcaption>`), navegable con teclado; si hay lightbox,
  es `<dialog>` nativo con cierre `Esc`, foco devuelto y botones ≥ 44 px.
- Dark mode mediante tokens `light-dark()` del template con **paleta oscura propia** (no inversión):
  fondo casi negro cálido, texto marfil, acento controlado.
- Transiciones entre páginas con View Transitions de Astro (`<ClientRouter />`) o CSS;
  **deshabilitadas** bajo `prefers-reduced-motion`.
- JSON-LD `Person` (name, jobTitle, url, sameAs Instagram) en home y `sobre-mi`;
  `ImageObject`/`CreativeWork` opcional en trabajos.
- Estructura preparada para i18n (rutas en `src/pages/`, strings en `site.ts` o `src/i18n/`), sin
  implementar inglés.
- Nota de entrega con tabla de imágenes requeridas (slug, cantidad, ratio, ancho máx., formato).

## Criterios de aprobación
Todos los gates de `quality-gates.md` **más**:
- [ ] Gate 6 estricto: **≤ 100 KB gz** de JS en home y en una página de trabajo, aunque haya lightbox
      y transiciones. Si usa `motion`, solo como isla con `client:visible`.
- [ ] Gate 7: imagen LCP ≤ 200 KB en AVIF/WebP con `srcset` (al menos 3 anchos) y `sizes` correcto.
- [ ] Gate 8: ≤ 3 archivos de fuente; la tipografía display tiene carácter (serif/display variable) y
      se justifica en una línea.
- [ ] Teclado: con Tab se recorre índice → proyecto → fotos → cierre de lightbox sin trampas; el foco
      es visible sobre fondo oscuro (≥ 3:1).
- [ ] Dark: captura 1280-dark no es la light invertida; las fotos (placeholders) no llevan borde
      blanco; contraste de texto ≥ 4.5:1 (axe en dark).
- [ ] Reduced motion: con la emulación activa, cambiar de proyecto no produce desplazamiento ni zoom;
      solo fade o nada.
- [ ] `check-seo` 0 errores con `--site https://inescarvallo.com`; cada `/trabajos/<slug>/` tiene
      title/description/OG únicas.
- [ ] Gate 9: solo pueden quedar placeholders en imágenes.

## Anti-patrones que fallan el caso
- Scroll-jacking, parallax, cursor personalizado, loader de entrada.
- Masonry por JS (CSS `columns` o grid basta).
- Lightbox con librería > 20 KB o que no devuelve el foco.
- Dark mode `filter: invert()` o solo cambiar `bg-black text-white`.
- Textos "Fotógrafa apasionada por capturar momentos únicos" y similares (slop de copy).
- Grid de 3 tarjetas idénticas con `rounded-2xl` y sombra para los proyectos.
- Mezclar Inter como única tipografía cuando el brief pide carácter.
