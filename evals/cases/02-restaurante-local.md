# Caso 02 — Restaurante local con LocalBusiness

## Prompt (pegar tal cual)

```
Hazme la página web de La Fonda de Rosalía, un restaurante venezolano en Doral, Miami. Comida
casera: arepas, pabellón, cachapas, parrilla los fines de semana. Abrimos martes a domingo de
11:30 a 22:00, lunes cerrado. Quiero que la gente nos encuentre en Google cuando busque
"restaurante venezolano Doral", que vean el menú desde el celular sin descargar PDF, puedan
reservar llamando o por WhatsApp, y vean dónde estamos. Página en español. Teléfono (305) 555-0147,
estamos en 10800 NW 58th St, Doral, FL 33178. Instagram @lafondaderosalia.
```

## Respuestas a preguntas (si el agente pregunta)
- Colores: cálidos, terracota y crema; nada de rojo-amarillo de comida rápida.
- Fotos: hay 8 fotos de platos en el teléfono, aún no las tienes → placeholders marcados, con
  medidas recomendadas.
- Menú: 4 secciones (Entradas, Platos principales, Parrilla fin de semana, Bebidas), 5–6 ítems por
  sección, precios en USD entre $4 y $28. Inventa nombres de platos típicos venezolanos pero marca
  los precios como `PLACEHOLDER` hasta confirmar.
- Reservas: no hay sistema; solo teléfono y WhatsApp al mismo número.
- Dominio: lafondaderosalia.com (todavía sin comprar).

## Artefactos esperados
- Proyecto Astro desde `templates/astro-marketing`.
- Páginas: `/` (hero + destacados + horario + mapa/dirección + CTA), `/menu/` (HTML, no PDF),
  `/contacto/` o sección equivalente, `/404`.
- JSON-LD **`Restaurant`** (subtipo de `LocalBusiness`) vía `src/lib/jsonld.ts` → `localBusiness({ type: 'Restaurant', … })` con:
  `name`, `address` (PostalAddress completa), `telephone` en formato E.164 `+13055550147`,
  `openingHoursSpecification` (Tu–Su 11:30–22:00; lunes ausente o explícitamente cerrado),
  `servesCuisine: "Venezuelan"`, `priceRange`, `sameAs` Instagram, `geo` si el agente puede
  obtenerla con certeza (si no, omitir — no inventar coordenadas).
- Botón WhatsApp `https://wa.me/13055550147?text=...` con texto accesible, ≥ 44 px.
- `tel:+13055550147` en el header móvil.
- Horario visible como **texto** (no imagen) en home y contacto, con el mismo dato que el JSON-LD.
- `site.ts` con `lang: 'es'`, dominio, `locale` `es_US` o `es` en OG.

## Criterios de aprobación
Todos los gates de `quality-gates.md` **más**:
- [ ] `check-seo` 0 errores con `--site https://lafondaderosalia.com`.
- [ ] JSON-LD `Restaurant` valida en https://validator.schema.org **y** en la Prueba de resultados
      enriquecidos de Google sin errores (warnings de campos opcionales se anotan).
- [ ] `/menu/` a 375 px: cada ítem con nombre, descripción corta y precio en la misma línea o bloque,
      legible sin zoom (≥ 16 px), secciones navegables con anclas o `<nav>` secundario.
- [ ] Gate 7: la foto hero (placeholder) está declarada con `<Image>` de Astro, `width/height`,
      `loading="eager"` + `fetchpriority="high"`; el resto `loading="lazy"`.
- [ ] Gate 9: solo pueden quedar placeholders en **precios** y **fotos**; se listan en la entrega.
- [ ] Horario del JSON-LD == horario del texto visible (coherencia).
- [ ] Título home contiene "restaurante venezolano" y "Doral" de forma natural, ≤ 60 caracteres.

## Anti-patrones que fallan el caso
- Menú como imagen o PDF enlazado.
- Coordenadas `geo` inventadas o dirección "aproximada".
- `openingHours` como string libre tipo "Mar-Dom 11:30-22:00" en lugar de `openingHoursSpecification`.
- Carrusel autoplay de fotos sin pausa (gate 10 / 2.2.2).
- Tipografía "script"/manuscrita para el cuerpo del menú (legibilidad).
- Teléfono en dos formatos distintos entre header, footer y JSON-LD.
