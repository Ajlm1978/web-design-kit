# Migración de sitios existentes — doctrina

Última verificación: 2026-10-08. Aplica a `/migrate-site` (fases 0–5) y a `/new-website --from brief.json`.
Objetivo: el sitio nuevo hereda **todo** el valor acumulado del viejo (URLs, enlaces entrantes, señales de
contenido) y pierde solo lo que decidimos perder, de forma explícita y documentada.

## 1. Por qué 301 + paridad, y no "ya se reindexará"
- Cada URL antigua con enlaces entrantes, marcadores o historial en buscadores es un activo. Si responde 404,
  la autoridad que apuntaba a ella se evapora en semanas y el tráfico orgánico cae; recuperarlo cuesta meses.
- El **301 permanente** transfiere esa señal a la URL nueva (Google lo trata como canonicalización). 302/307
  no sirven: son temporales y no consolidan. Meta refresh y redirecciones por JavaScript tampoco: son lentas,
  no siempre se siguen y rompen el "cambio de dirección" de Search Console.
- **Paridad** = cada URL del inventario antiguo termina (directa o vía 301) en un archivo real de `dist/`.
  Es un gate, no un consejo: `check-redirects.mjs <inventory> <dist>` sale con 1 si queda una huérfana.
- Reglas de mapeo (`mapping.json`): misma ruta normalizada → sin redirect; slug cambiado → 301; página
  descartada → 301 a la página padre más cercana que conserve la intención (no a la home por defecto); solo
  **410** cuando el cliente quiera declarar que el contenido no volverá (p. ej. producto retirado).
- Nunca encadenes redirects (viejo → intermedio → nuevo): cada salto resta; apunta siempre al destino final.
- El 301 va en el host (`vercel.json` `redirects` / `public/_redirects` en Cloudflare), nunca en una página
  HTML del sitio. Las cabeceras existentes se conservan: `plan-redirects` hace merge, no sobrescribe.

## 2. Qué SEO se preserva y qué no
Se preserva si se migra bien: URLs (o su 301), `title`/`description` cuando eran correctos, el texto real,
los H1/H2, las imágenes con su `alt`, las fechas de publicación (`datePublished` del post, no la fecha de
la migración), autor, el JSON-LD de negocio (NAP: nombre, dirección, teléfono) y el sitemap.
No se "copia" y hay que reconstruir con criterio: metadatos duplicados o vacíos (el extractor los marca),
canónicas rotas, `FAQPage`/`HowTo` (rich results retirados), plugins SEO que inyectaban basura, parámetros
`?utm_` en enlaces internos, paginaciones infinitas de etiquetas. Se mejora siempre: HTML prerenderizado,
LCP (hero `eager` + `fetchpriority`), `width`/`height` en imágenes, 404 real, robots con política IA.
Después del lanzamiento: mantener el sitemap antiguo **no**; enviar el nuevo y comprobar en Search Console
que las URLs antiguas pasan a "Página con redirección". Caída temporal de 1–3 semanas es normal; 404 no.

## 3. Páginas basura: cómo tratarlas
Criterios para descartar (lo decide el cliente en la ronda única de `--from`): < 100 palabras sin enlaces
entrantes, duplicados (`contentHash` igual), archivos de fecha/autor/etiqueta sin tráfico, páginas de
"gracias"/legales obsoletas, pruebas olvidadas, contenido caducado (promos, eventos pasados).
- Con enlaces entrantes o tráfico → **no se borra**: se fusiona en la página viva más cercana y se redirige.
- Sin señales → 301 al padre temático (servicios → `/servicios/`, post → `/blog/`), o 410 si el cliente lo pide.
- Nunca "noindex y a vivir": una página noindex sigue gastando rastreo y confunde al equipo. O vive, o redirige.
- Las URLs con parámetros, `/feed/`, `/wp-json/`, `/xmlrpc.php`, `/page/N/` se redirigen a su recurso base;
  no cuentan como contenido pero sí como URL antigua (paridad).

## 4. Sitios bilingües (es/en): hreflang
- Una URL por idioma y por página (`/servicios/` y `/en/services/`), nunca detección automática por IP o
  `Accept-Language` sin URL propia: el rastreador solo ve una versión.
- Cada página emite `<link rel="alternate" hreflang="es" href="…">`, su equivalente `en` y
  `hreflang="x-default"` (la versión de entrada, normalmente la principal). **Recíproco**: si A apunta a B,
  B apunta a A; si falta la pareja, Google ignora el bloque.
- Códigos ISO 639-1 (+ región si importa: `es-US`, `es-ES`); `lang` del `<html>` coherente con el hreflang.
- Canónica autorreferencial en cada idioma; nunca canonicalizar la versión EN hacia la ES.
- En la migración: si el sitio viejo tenía solo una lengua y el nuevo dos, el 301 va a la **misma lengua**; las
  páginas nuevas en el otro idioma son contenido nuevo, no destino de redirects.
- Fuera de alcance del kit: idiomas distintos de es/en y traducción automática del contenido migrado.

## 5. Search Console: "Cambio de dirección" y checklist de lanzamiento
Solo si cambia el **dominio** (p. ej. `.com.ve` → `.com`); si cambia solo el diseño o las rutas dentro del
mismo host, no se usa: bastan los 301 + sitemap nuevo.
1. Verificar la propiedad del dominio nuevo en Search Console antes del corte (DNS TXT).
2. Publicar el sitio nuevo y los 301 (dominio viejo → nuevo, misma ruta o su mapeo). Comprobar con `curl -I`
   una muestra: código 301 y `Location` definitivo, sin cadenas.
3. En la propiedad **antigua**: Ajustes → Cambio de dirección → elegir la nueva; la herramienta valida que la
   home y una muestra redirigen. Mantener los 301 del dominio viejo **al menos 12 meses** (Google) y, si el
   dominio se renueva, para siempre.
4. Enviar `sitemap-index.xml` nuevo en la propiedad nueva; no borrar la antigua (sirve para ver las URLs que
   siguen recibiendo tráfico y detectar huérfanas).
5. Bing Webmaster Tools: "Site Move" equivalente; IndexNow para acelerar.
6. Negocio local: actualizar la URL en Google Business Profile, directorios y perfiles sociales (coherencia NAP).
7. Vigilancia 4 semanas: informe de Cobertura (404 que suben = redirect que falta), Rendimiento por página
   comparando con el mes anterior, y `check-redirects` otra vez tras cualquier cambio de rutas.

## 6. Qué NO se migra
- Secretos y configuración: `.env*`, claves de API, credenciales de plugins, usuarios de WordPress. El escáner
  no los copia y avisa; si aparecen en un repo, se reporta al cliente para rotarlos.
- Código del CMS/plugins (shortcodes, builders, widgets), CSS/JS del tema, trackers y pixels antiguos (se
  vuelven a añadir solo los que el cliente confirme), formularios con backend (se reconstruyen con un servicio
  o Worker), carrito/login (fuera de alcance), comentarios de WordPress (se exportan, no se publican).
- Contenido de terceros embebido sin licencia, reseñas copiadas de Google/Yelp como `Review`/`AggregateRating`
  (solo reseñas de primera parte), imágenes de stock sin derechos claros.
- Páginas de `draft`/`private`/`trash` del WXR (se cuentan en `skipped`), URLs con parámetros de sesión,
  archivos de fecha/autor, feeds, `wp-json`, `xmlrpc`. Se redirigen (paridad), no se recrean.
- Datos que no estén en la fuente: si el sitio viejo no tenía teléfono, el nuevo lleva `null`, no un ejemplo.

## 7. Entregables mínimos de una migración
`migration/AUTHORIZATION.md` (quién autorizó, fecha), `inventory.json`, `audit.md` (para el cliente),
`content/blog/*.md` + `content/pages/*.md` + `brief.json` (con `sources` y `confidence`), `mapping.json` (decisiones de descarte),
`redirects.json` + bloque en `vercel.json`/`_redirects`, salida de `check-redirects` con 0 huérfanas, y el
proyecto Astro en verde (`npm run check && npm run build && npm test`, `check-seo` 0 errores).
