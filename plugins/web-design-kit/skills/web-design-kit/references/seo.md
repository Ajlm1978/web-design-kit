# SEO 2026 — doctrina del kit

**Verificado: 2026-10-07.** Aplica a sitios estáticos Astro 7 generados desde
`templates/astro-marketing/`. Herramienta de verificación: `scripts/check-seo.mjs`
(sin dependencias) y la skill `seo-audit`. Fuente primaria: Google Search Central,
incluida la guía del 15-may-2026 *"Optimizing your website for generative AI features"*.

Resumen en una frase: **lo que posiciona en Google y lo que te cita una IA es lo
mismo — HTML prerenderizado, rápido, con metadatos correctos y contenido real**.

## 1. HTML prerenderizado: no negociable

- Todo el contenido indexable debe estar en el HTML inicial (`output: 'static'` por
  defecto en Astro). Nada de "se renderiza en el cliente y Google ya lo ejecutará".
- Google renderiza JS, pero en una cola diferida. Los rastreadores de IA relevantes
  **no ejecutan JavaScript** (estudio Vercel/MERJ: GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, PerplexityBot leen solo la respuesta HTML). Una SPA es
  invisible para ellos.
- Islas React (`client:visible`, `client:idle`) solo para interacción; el texto que
  importa va en `.astro`. Si una isla pinta texto SEO, debe venir prerenderizado
  (sin `client:only`).
- **Prohibido** el rewrite catch-all `/(.*) → /index.html`: devuelve 200 con la
  portada para URLs inexistentes → soft-404 masivos. `vercel.json` del template solo
  lleva cabeceras; Cloudflare usa `not_found_handling: "404-page"`.
- Core Web Vitals (sin cambios en 2026): **LCP ≤ 2,5 s · INP ≤ 200 ms · CLS ≤ 0,1**
  en el percentil 75 de usuarios reales (CrUX). Chrome está desplegando CWV para
  *soft navigations* de SPAs en 2026; con `<ClientRouter/>` desactivado (default del
  template) no nos afecta.

## 2. Metadatos por ruta, en el HTML inicial

Los emite `src/components/SEO.astro` vía `<Base>`. Reglas:

| Elemento | Regla |
|---|---|
| `<title>` | Único por página, 10–65 caracteres, `Página · Marca`. Portada puede usar `rawTitle`. |
| `meta description` | 50–160 caracteres, escrita para el clic, no para keywords. Nunca la misma en dos páginas. |
| `<link rel="canonical">` | Absoluta, autorreferencial, calculada de `Astro.site` + `Astro.url.pathname`. Requiere `site` en `astro.config.mjs` (sale de `SITE.url`). |
| `<h1>` | Exactamente uno, con el tema principal; no es el logo. |
| Open Graph | `og:type`, `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:url`, `og:image` (absoluta, 1200×630, **PNG/JPG** — muchos scrapers no renderizan SVG), `og:image:alt`. |
| Twitter | `twitter:card=summary_large_image`, title, description, image, image:alt. |
| `<html lang>` | De `SITE.locale`. Imprescindible para accesibilidad y segmentación por idioma. |
| `meta robots` | `index,follow,max-image-preview:large` por defecto; `noindex,follow` en 404, gracias, previews. |

No emitas `meta keywords` (ignorado desde 2009) ni `og:image` relativo.

## 3. JSON-LD: qué, cuándo y qué NO

Constructores tipados en `src/lib/jsonld.ts`; se inyectan con `jsonLd={[...]}`.
Regla del kit: **nunca inventes datos** (`compact()` omite lo que no existe).

| Tipo | Cuándo | Página |
|---|---|---|
| `Organization` (+ `@id` `/#organization`) | Siempre | Portada (una vez) |
| `WebSite` | Siempre; `SearchAction` solo si hay buscador propio | Portada |
| `LocalBusiness` (o subtipo: `Dentist`, `Restaurant`…) | Negocio con dirección física o área de servicio | Portada o /contacto |
| `Product` + `Offer` | Página de producto con precio real | Cada producto |
| `Article`/`BlogPosting` + `Person` autor | Blog, noticias, guías | Cada artículo |
| `BreadcrumbList` | Toda página de nivel ≥ 2 | Interiores |
| `VideoObject` | Vídeo propio incrustado con `thumbnailUrl`, `uploadDate`, `duration` | Donde esté el vídeo |
| `Event` | Fecha, lugar y `offers` reales | Página del evento |

**No añadir:**
- `FAQPage` — Google **retiró los rich results de FAQ el 7-may-2026** (ya limitados a
  gobierno/salud desde 2023). `HowTo` retirado en 2023. Solo bytes muertos.
- `AggregateRating`/`Review` sin reseñas reales de primera parte → acción manual.
- `speakable`, `Dataset`, `SiteNavigationElement`, marcado "para la IA": Google
  afirma que **no necesita marcado especial** para funciones generativas.
- `@type` duplicado en varias páginas (una `Organization` por sitio, no por página).

Validar con Rich Results Test (`search.google.com/test/rich-results`) y
`validator.schema.org`. El script del kit solo comprueba que parsea y tiene
`@context` + `@type`.

## 4. Sitemap y robots.txt (política IA)

- `@astrojs/sitemap` genera `sitemap-index.xml` + `sitemap-0.xml`. Excluye con
  `filter` las páginas `noindex`. `<link rel="sitemap">` ya está en `Base.astro`.
- `public/robots.txt`: `Allow: /` general + `Sitemap:` absoluto (cambiar
  `example.com`). No usar `robots.txt` para ocultar nada sensible: no es seguridad.
- **Pregunta obligatoria al cliente** antes de publicar:
  *"¿Permitir búsqueda con IA (citas y tráfico) y bloquear solo el entrenamiento?"*
  Opción por defecto del kit: **sí a búsqueda, el cliente decide entrenamiento**.

| Agente | Función | Default kit |
|---|---|---|
| Googlebot | Búsqueda + AI Overviews/AI Mode (no separable) | Allow |
| Google-Extended | Solo entrenamiento Gemini; **no afecta ranking** | Allow (opt-out comentado) |
| OAI-SearchBot, ChatGPT-User | Búsqueda/citas ChatGPT | Allow |
| GPTBot | Entrenamiento OpenAI | Allow (opt-out comentado) |
| ClaudeBot, PerplexityBot | Citas/respuestas | Allow |
| Bingbot | Bing + Copilot | Allow |

- Bloquear GPTBot/Google-Extended **no reduce** visibilidad en búsqueda; bloquear
  OAI-SearchBot/PerplexityBot **sí** elimina citas. Explícalo así al cliente.
- `llms.txt`: Google **no lo usa**; Ahrefs (may-2026) midió que el 97 % de los
  `llms.txt` publicados reciben **cero** peticiones. Artefacto opcional, nunca
  requisito del kit, nunca sustituto del HTML.

## 5. hreflang / i18n con Astro

- Solo cuando hay versiones **traducidas** reales, no para "es" y "es-MX" idénticos.
- Astro: `i18n: { defaultLocale: 'es', locales: ['es','en'], routing: { prefixDefaultLocale: false } }`
  + `@astrojs/sitemap` con `i18n: { defaultLocale, locales }` (emite `xhtml:link`).
- En `<head>`: un `<link rel="alternate" hreflang="xx" href="absoluta">` por idioma
  **más** `hreflang="x-default"`; cada página se referencia a sí misma (recíproco).
- `<html lang>` y `og:locale` cambian por idioma; canónica apunta a la propia
  versión, nunca a la versión "principal".
- Mismo dominio con subcarpeta (`/en/`) salvo que el cliente tenga ccTLD. Nunca
  redirección automática por IP sin enlace manual al otro idioma.

## 6. Imágenes

- `<Picture>`/`<Image>` de `astro:assets` → AVIF + WebP + fallback, `width`/`height`
  siempre (evita CLS), `sizes` honesto.
- **Imagen LCP (hero)**: `loading="eager"` + `fetchpriority="high"` +
  `decoding="async"`. **Nunca `loading="lazy"` en el hero** — es el error de LCP
  más común y `check-seo.mjs` lo marca como error.
- Resto: `loading="lazy"` (default de Astro). `alt` descriptivo; decorativas
  `alt=""`. Nombre de archivo legible (`fachada-clinica-madrid.jpg`).
- OG image rasterizada (PNG/JPG 1200×630). El `og-default.svg` del template es un
  marcador: sustituir antes de publicar.
- Fuentes autoalojadas con `font-display: swap` + `size-adjust` (Fonts API de Astro)
  → sin CLS tipográfico. Preload solo la fuente del titular.

## 7. SEO local

- **Google Business Profile** es el activo #1 para negocio local: reclamar,
  verificar, categoría principal correcta, horario, fotos reales, respuesta a
  reseñas. La web lo apoya, no lo sustituye.
- **Consistencia NAP** (nombre, dirección, teléfono) idéntica en GBP, pie de web,
  `/contacto` y `LocalBusiness` JSON-LD (`SITE.contact` es la única fuente).
  Teléfono en E.164 en JSON-LD (`+13050000000`).
- `LocalBusiness` con `@type` específico, `geo`, `openingHoursSpecification` o
  `openingHours`, `areaServed` si no hay local físico. Mapa embebido opcional
  (ojo CSP `frame-src`).
- Página por ciudad/servicio **solo** con contenido distinto; las "doorway pages"
  con texto clonado se penalizan.

## 8. E-E-A-T (experiencia, pericia, autoridad, confianza)

Google no lo mide con una etiqueta; lo infiere del sitio y de la web. Señales que
el kit puede materializar:

- Página **Sobre nosotros** con personas reales, fotos, trayectoria, credenciales.
- Autor con nombre en cada artículo (`Person` con `url` a su bio) y fechas visibles
  `datePublished`/`dateModified` coherentes con el texto.
- Contacto completo (dirección, teléfono, email, formulario), política de
  privacidad, términos, aviso legal (obligatorios en UE/LATAM para confianza).
- Citas y enlaces salientes a fuentes primarias; casos con cifras verificables
  (los contadores a cero del template deben reemplazarse o eliminarse).
- HTTPS, cabeceras de seguridad (`vercel.json`/`_headers`), sin anuncios
  intrusivos, sin textos generados sin revisión humana.

## 9. GEO / AEO: qué funciona vs. mitos

Posición oficial de Google (guía 15-may-2026): las funciones generativas (AI
Overviews, AI Mode) **se alimentan del índice y del ranking normales**. No hay
"SEO para IA" separado. Lo que sí influye y controlamos:

- Contenido **indexable, único y con hechos concretos** (cifras, nombres, fechas) —
  las IA citan pasajes con información extraíble.
- Encabezados que responden preguntas reales; párrafos autocontenidos de 40–80
  palabras bajo cada `h2`/`h3`; definiciones y listas donde aporten.
- Snippet y preview permitidos (`max-snippet` sin restringir, `nosnippet` ausente).
- Entidad clara: `Organization` + `sameAs` a perfiles reales, nombre consistente.
- Para Bing/Copilot/ChatGPT: **IndexNow** (ver §10) + Bing Webmaster Tools.

Medición: Search Console → informe **"Rendimiento en IA generativa"**
(impresiones/clics desde AI Overviews y AI Mode); Bing WMT → **AI Performance**.

## 10. IndexNow (Bing, Copilot, Yandex, Naver, Seznam)

- Protocolo push: `GET https://api.indexnow.org/indexnow?url=<URL>&key=<KEY>` tras
  cada deploy. Google **no participa** — para Google sirve el sitemap.
- Fichero `public/<KEY>.txt` con la clave; publicar desde CI (paso post-deploy) o
  con la integración `astro-indexnow`/script propio (opt-in; no está en el template).
- Enviar solo URLs modificadas, hasta 10 000 por POST JSON a
  `https://api.indexnow.org/indexnow` con `host`, `key`, `urlList`.

## 11. Mitos 2026

| Mito | Realidad verificada |
|---|---|
| "Hace falta `llms.txt` para salir en ChatGPT/Gemini" | Google no lo usa; 97 % reciben cero peticiones (Ahrefs, may-2026). Opcional. |
| "Marcar FAQPage/HowTo da rich results" | FAQ retirado 7-may-2026; HowTo en 2023. Cero efecto. |
| "Las IA renderizan mi SPA" | Ningún rastreador IA relevante ejecuta JS. Prerender obligatorio. |
| "Bloquear GPTBot me saca de Google" | GPTBot/Google-Extended solo controlan entrenamiento; ranking intacto. |
| "Existe un 'GEO' distinto del SEO" | Google: funciones IA rooted en core ranking. Mismo trabajo. |
| "Un rewrite a index.html es inofensivo en estático" | Produce soft-404: Search Console lo marca y desperdicia crawl. |
| "La `meta keywords` ayuda" | Ignorada desde 2009. No emitir. |
| "Más JSON-LD = más ranking" | El marcado habilita rich results concretos; no es factor de ranking. Solo tipos con soporte. |
| "Lighthouse 100 = CWV aprobados" | Lighthouse es laboratorio (y v13 renombró IDs); CWV se miden en campo (CrUX, p75). |
| "IndexNow acelera Google" | Google no participa; sirve para Bing/Copilot/Yandex. |
| "Lazy-load todas las imágenes" | El hero LCP debe ser `eager` + `fetchpriority="high"`. |
| "Bing no importa" | Bing alimenta Copilot y ChatGPT search; AI Performance report + IndexNow. |

## 12. Checklist de lanzamiento

Pre-deploy (automatizable):
- [ ] `SITE.url`, `SITE.name`, `SITE.description`, `robots.txt` `Sitemap:` sin `example.com`/`PLACEHOLDER`.
- [ ] `npm run build` + `node scripts/check-seo.mjs dist --site https://dominio.com` → 0 errores.
- [ ] `npx lhci autorun` (o `npx lighthouse <url>`): SEO 100, A11y 100, Perf ≥ 90.
- [ ] Rich Results Test sin errores en portada y una página de cada tipo.
- [ ] OG image PNG/JPG real; probar con `opengraph.xyz` o el debugger de LinkedIn.
- [ ] 404 real (`curl -I /no-existe` → `404`), redirecciones 301 de URLs antiguas.
- [ ] `<html lang>` correcto; hreflang recíproco si hay idiomas.

Post-deploy (manual, con el cliente):
- [ ] **Google Search Console**: verificar dominio (DNS), enviar `sitemap-index.xml`, inspeccionar portada, revisar "Rendimiento en IA generativa" a las 4 semanas.
- [ ] **Bing Webmaster Tools**: importar desde GSC, enviar sitemap, configurar IndexNow key.
- [ ] **Google Business Profile** (si local): reclamar/actualizar, NAP idéntico a la web, enlace al sitio.
- [ ] Decisión documentada del cliente sobre rastreadores IA (búsqueda sí / entrenamiento sí-no) aplicada en `robots.txt`.
- [ ] Analítica respetuosa configurada y añadida a CSP (`script-src`/`connect-src`).
- [ ] Revisión a 30 días: cobertura, CWV en campo (CrUX), consultas, errores de rastreo.
