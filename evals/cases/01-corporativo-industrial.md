# Caso 01 — Corporativo industrial (B2B)

## Prompt (pegar tal cual)

```
Necesito la web de Metalúrgica Varela, una empresa familiar de Valencia que lleva 35 años
fabricando estructuras metálicas y cerramientos industriales para naves y obra civil. Clientes:
constructoras e ingenierías. Quiero que transmita solidez y precisión, nada de look de startup.
Páginas: inicio, servicios (estructuras, cerramientos, mantenimiento), proyectos (6 casos con
foto), empresa (historia, equipo, certificaciones ISO 9001 y EN 1090), contacto con formulario y
mapa. Idioma español. Tiene que cargar rápido en móvil porque los jefes de obra la miran desde el
teléfono. Déjala lista para publicar en nuestro dominio metalurgicavarela.es.
```

## Respuestas a preguntas (si el agente pregunta)
- Colores de marca: azul acero oscuro y gris; el logo es un texto "VARELA" en mayúsculas (no hay archivo).
- Fotos: no hay todavía; usa placeholders claramente marcados y dime qué medidas necesito.
- Teléfono: +34 961 000 000 · Email: info@metalurgicavarela.es · Dirección: Polígono Fuente del
  Jarro, C/ Ciudad de Sevilla 12, 46988 Paterna (Valencia).
- Hosting: lo que recomiendes, cuanto más barato mejor.
- Redes: LinkedIn solo.

## Artefactos esperados
- Proyecto Astro scaffoldeado desde `templates/astro-marketing` (no Vite SPA, no Next).
- Páginas: `/`, `/servicios/`, `/proyectos/` (+ 6 detalles o tarjetas), `/empresa/`, `/contacto/`, `/404`.
- `src/config/site.ts` con nombre, dominio `https://metalurgicavarela.es`, datos de contacto reales del brief.
- JSON-LD `Organization` en la home (nombre, url, logo o sin logo, `contactPoint`, `sameAs` LinkedIn).
- Formulario de contacto con labels visibles, `autocomplete`, mensajes de error accesibles, honeypot.
- Mapa: enlace/embebido **sin** romper la CSP (si embebe Google Maps, añade el origen a `frame-src`
  y lo documenta) o alternativa estática con enlace "Cómo llegar".
- `wrangler.jsonc` con `name` real; `_headers` intacto; `robots.txt` y sitemap con el dominio real.
- `README` o nota de entrega con medidas de las fotos que faltan y qué placeholders quedan.
- Tests Playwright+axe extendidos a las páginas nuevas (no solo las 3 del template).

## Criterios de aprobación
Todos los gates de `quality-gates.md` **más**:
- [ ] `check-seo` 0 errores con `--site https://metalurgicavarela.es`.
- [ ] JSON-LD valida en https://validator.schema.org sin errores.
- [ ] Lighthouse móvil en `/proyectos/` (la página con más imágenes) ≥ 90 perf.
- [ ] Tipografía: no es Inter sola; el par elegido se justifica en una línea (en el README o en la transcripción).
- [ ] Certificaciones ISO 9001 / EN 1090 aparecen como texto (no solo como imagen) y sin inventar números de certificado.
- [ ] Gate 9 (placeholders) **puede fallar** solo en imágenes de proyectos; cualquier otro placeholder = falla.

## Anti-patrones que fallan el caso
- Hero con gradiente morado/azul, blobs, o tarjetas glassmorphism (brief dice "nada de startup").
- Tres tarjetas idénticas icono-título-párrafo en la home sin variación.
- Datos inventados: años de fundación distintos de 35, número de empleados, clientes con nombre.
- Formulario que "envía" a ninguna parte sin decir cómo conectarlo.
- Scaffold con React Router SPA o `tailwind.config.js` (indica que se usó el comando legacy).
