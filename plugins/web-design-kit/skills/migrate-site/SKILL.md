---
name: migrate-site
description: |
  Migra un sitio web existente (URL pública, carpeta local, export WXR o repo git) al
  web-design-kit sin perder URLs: pide autorización escrita, inventaría el sitio,
  entrega una auditoría vendible (`audit.md`), extrae el contenido real a Markdown +
  `brief.json` con `confidence` por campo, reconstruye con `/new-website --from` y
  cierra con redirects 301 + paridad verificada contra `dist/`. Usar cuando el cliente
  diga "rehacer/rediseñar mi web actual", "pasar de WordPress/Wix a algo rápido",
  "migrar el blog", "auditar el sitio que tengo". No usar para sitios ajenos sin
  permiso, e-commerce con carrito, áreas con login o sitios > 300 páginas.
license: MIT
metadata:
  version: 2.1.0
  last_verified: 2026-10-08
---

# migrate-site — de un sitio existente a un sitio del kit, sin perder URLs

Doctrina: `../web-design-kit/references/migration.md` (léela si no está en contexto).
Scripts (Node ≥ 22, cero dependencias): `${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/migrate/`.
Define al empezar: `M="${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/migrate"` y `OUT=migration`
(o lo que diga `--out`). Todo artefacto vive bajo `$OUT/` en el directorio del proyecto nuevo.
Cada script acepta `--help` y `--json`; exit 1 = error fatal o gate fallido. En Windows + Git Bash pasa
las rutas sin barra inicial o exporta `MSYS_NO_PATHCONV=1`.

Principios: **nada inferido sin `confidence`** (lo no encontrado es `null`, nunca inventado) · **paridad de
URLs es un gate, no un consejo** · **maker ≠ checker** (la auditoría del sitio nuevo la hace otra sesión).

## Fase 0 — Autorización (gate: sin "sí" explícito → STOP)

Antes de tocar la red o el disco pregunta, literalmente:

> "¿Eres el propietario de este sitio o tienes autorización escrita del cliente para rastrearlo, copiar su contenido y reconstruirlo? (sí/no)"

- Cualquier respuesta que no sea un **sí explícito** ("sí", "si", "yes", "soy el dueño") → **STOP**. No rastrees,
  no escanees, no clones. Explica que el kit no migra sitios de terceros sin permiso y termina.
- Con "sí": crea `$OUT/AUTHORIZATION.md` con: **quién** autoriza (nombre y rol: propietario / cliente), **fecha**
  (ISO), **base de la autorización** (propietario · contrato · email del cliente · otro, citado textualmente) y
  **origen** (`--url` / `--dir` / `--repo` tal cual se pasó). Sin ese archivo las fases siguientes no arrancan.

## Fase 1 — Inventario (gate: ≥ 1 página, sin error fatal)

```bash
# URL pública (respeta robots.txt, 2 req/s, timeout 15 s, mismo origen, máx. 300 páginas)
node "$M/crawl-site.mjs" https://sitio-viejo.com --out "$OUT" [--max-pages 300] [--render] [--delay-ms 500] [--timeout-ms 15000]
#   --delay-ms 0 solo contra un fixture/servidor local propio (CI); --timeout-ms más alto para hosts lentos.
# Carpeta, export WXR o repo (owner/repo · URL https · git@); nunca copia .env*, *.pem, *.key, id_rsa*
node "$M/scan-source.mjs" <ruta|export.xml|owner/repo> --out "$OUT" [--build] [--base-url https://sitio-viejo.com]
```
Salida: `$OUT/inventory.json` (+ `$OUT/raw/<sha1>.html`). Lee `stats`, `skipped[]` y `warnings[]` y repórtalos:
- `skipped.reason: 'robots'` → el sitio prohíbe esas rutas: no se insiste. `'js-only'` → repite con `--render`
  solo si el proyecto nuevo ya tiene `@playwright/test` instalado (`npm i -D @playwright/test && npx playwright install chromium`);
  si no, avisa de inventario parcial y sigue. Redirigidas (`'redirect'`) no cuentan como páginas.
- exit 1 con `robots.txt` `Disallow: /` → el sitio no quiere ser rastreado: pide al cliente un export (WXR) o
  la carpeta del tema y usa `scan-source`. No lo rodees.
- Más de `--max-pages` → avisa que se truncó; sitios > 300 páginas están fuera de alcance (ver límites).
- `warnings[]` que mencionen `.env` o claves → informa al cliente que debe **rotarlas**; no las copies ni las cites.
- Con `--dir`/`--repo` sin `--base-url`, las URLs salen como `http://localhost/...`: pasa el dominio real si lo conoces.

## Fase 2 — Auditoría (siempre se genera)

```bash
node "$M/audit-site.mjs" "$OUT/inventory.json" --out "$OUT" [--lighthouse] [--no-fetch]
```
Salida: `$OUT/audit.md` + `$OUT/audit.json`. `--lighthouse` solo con inventario de URL pública (usa
`npx -y lighthouse` en móvil sobre las 5 páginas con más enlaces entrantes; si no hay Chrome se anota "no ejecutado").
En inventarios de carpeta/repo los enlaces a rutas dinámicas del CMS (`/tag/`, `/author/`) salen como
"no verificables", no como rotos.

**Qué mostrar al cliente** (en su lenguaje, sin jerga, a partir de `audit.md`):
1. El **Resumen ejecutivo** tal cual: qué pierde hoy (páginas sin título/descripción, enlaces rotos, imágenes
   pesadas, duplicados, HTTP/mixed content, robots/sitemap/rastreadores IA).
2. Tres o cuatro números: páginas inventariadas · enlaces rotos · duplicados · peso de imágenes · (Lighthouse móvil
   si corrió). Pega las cifras de `audit.json.summary`, no las redondees "a ojo".
3. El cierre **"qué cambia con la migración"** y lo que **no** cambia (contenido, URLs: todas se conservan o
   redirigen con 301).
4. Pide una decisión: seguir con la extracción (sí/no). La auditoría es vendible por sí sola; si el cliente
   para aquí, entrega `audit.md` y termina.

## Fase 3 — Extracción (gate: `brief.json` válido contra el schema v1)

```bash
node "$M/extract-content.mjs" "$OUT/inventory.json" --out "$OUT" --download-images [--source-root <carpeta escaneada>]
```
Salida: `$OUT/content/blog/<slug>.md` (posts; `<slug>` = último segmento de la URL original, p. ej.
`/blog/post-01/` → `post-01.md`, para que copiado a `src/content/blog/` conserve la URL) y
`$OUT/content/pages/<slug>.md` (páginas). Frontmatter: `sourceUrl, path, title, description, type page|post, date,
author, tags, images[], confidence`; el `title` ya viene sin el sufijo " - Nombre del sitio", el cuerpo no repite el
H1 (lo pinta la plantilla), los enlaces internos son relativos a la raíz y la meta de WP (fecha/autor/etiquetas) no
va en el cuerpo. `$OUT/assets/` (imágenes ≤ 10 MB, nombres slug) y `$OUT/brief.json`, cuyo `pages[]` lleva
`path` (ruta original), `targetPath` (por defecto la misma; posts fuera de `/blog/` → `/blog/<slug>/`) y `file`.
`--source-root` solo hace falta si `inventory.source.root` es `null` (repos clonados en tmp) y quieres leer CSS/imágenes del disco.
Comprueba:
- `brief.sources[campo].confidence`: cuenta los `high`; < 5 significa que el sitio aportó poco dato estructurado
  (sin JSON-LD, sin `<address>`): lo `medium/low/null` se confirma con el cliente en la ronda única de `--from`.
- `brand.colors`/`brand.fonts`: si `fontsource` es `null`, la fuente no está en la lista conocida (decisión en fase 4).
- Páginas con `confidence: medium` (sin `<main>`/`<article>`): revisa su Markdown; recorta restos de navegación si quedaron.
- Nunca edites `brief.json` a mano en silencio: si corriges algo, dilo y pon `confidence: high` solo con fuente verificada.

## Fase 4 — Reconstrucción (gates del kit)

1. Escribe **`$OUT/mapping.json`** con el cliente (una ronda). Claves = rutas antiguas tipo `page`; valores:
   - `"/old/": "/new/"` → se conserva con slug nuevo (301).
   - `"/old/": null` → se descarta → `plan-redirects` emite 301 al padre más cercano.
   - `"/a/": { "to": "/b/", "reason": "fusionadas", "status": 301 }` → fusión explícita (el `reason` evita el conflicto).
   - Rutas que no cambian **no se listan**: `plan-redirects` las trata como "sin cambios" y es `check-redirects`
     quien comprueba que existan en `dist/` (si quieres que una ruta olvidada sea error ya en el plan, usa `--strict`
     con `--keep` para las que se conservan). Los **posts** tampoco se listan: por defecto conservan su ruta
     (`brief.pages[].targetPath`; un post fuera de `/blog/` pasa a `/blog/<slug>/` y `plan-redirects --brief` emite
     su 301 solo); solo añádelos si el cliente cambia o descarta alguno.
   - Archivos de taxonomía del CMS (`/tag/<x>/`, `/author/<x>/`) sí hay que decidirlos: `null` (→ padre) o
     `{ "to": "/blog/", "reason": "archivo de etiquetas" }`; si no, `check-redirects` los dará como huérfanos.
   - Para `410` usa `{ "to": null, "status": 410, "reason": "…" }` solo si el cliente lo pide por escrito.
2. Hand-off: **`/web-design-kit:new-website --from $OUT/brief.json`** (sección 0-bis del comando). Esa fase
   valida el brief, confirma lo `medium/low/null` en una sola ronda, pregunta dirección de diseño (default:
   conservar marca, rehacer layout) y qué páginas se descartan (alimenta `mapping.json`), copia posts a
   `src/content/blog/`, páginas a `src/content/pages/` + `src/pages/<slug>.astro`, imágenes a `src/assets/migrated/`,
   activa `showBlog` si hay posts y corre los gates del kit (check, build, Playwright+axe, check-seo, lhci, PLACEHOLDER).
   Los posts se copian de `$OUT/content/blog/*.md` a `src/content/blog/` **sin renombrar** (el nombre ya es el slug de la URL).
   - Gate `check-seo`: el `--site` **debe ser igual a `SITE.url`** del sitio reconstruido (`src/config/site.ts`), y ese
     a su vez el dominio de producción. Si `brief.domain` es `null` (rastreo por IP/localhost/staging), pide al
     cliente el dominio de producción **antes** de correr `check-seo`; un `--site` distinto de `SITE.url` produce
     decenas de falsos `canonical-site`/`sitemap-site`. Pásale también `--redirects $OUT/redirects.json` (tras la
     fase 5) para que los enlaces internos hacia URLs antiguas redirigidas no cuenten como `link-broken`.
3. Al volver, confirma que existe `dist/` del build final antes de la fase 5.

## Fase 5 — Redirects y paridad (gate bloqueante: 0 huérfanas)

```bash
node "$M/plan-redirects.mjs" "$OUT/inventory.json" "$OUT/mapping.json" --out "$OUT" --brief "$OUT/brief.json" --vercel vercel.json --public public [--strict --keep /ruta/,/otra/]
node "$M/check-redirects.mjs" "$OUT/inventory.json" dist --redirects "$OUT/redirects.json"
```
- `plan-redirects` escribe `$OUT/redirects.json` `[{from,to,status,reason}]`, fusiona el bloque `redirects` en
  `vercel.json` (conserva `headers` y `trailingSlash`) y escribe `public/_redirects` (Cloudflare/Netlify).
  Los 410 se registran en `redirects.json` pero **no** van a `vercel.json`/`_redirects`. Exit 1 si dos orígenes
  apuntan al mismo destino sin `reason` → resuelve en `mapping.json`, no borrando la línea. Las rutas sin mapping
  cuentan como "sin cambios" (exit 0); con `--strict` son error.
- `check-redirects` con `--redirects "$OUT/redirects.json"` es el gate completo. Si le pasas `vercel.json`, solo
  comprueba huérfanas y bucles (ese archivo no guarda `reason`, así que no puede evaluar conflictos y lo dice).
- `check-redirects` resuelve cada URL antigua (máx. 5 saltos) contra `dist/` + reglas: **exit 1 = no se entrega**
  (huérfanas, bucles o conflictos). Corrige `mapping.json`, vuelve a `plan-redirects`, `npm run build` si tocaste
  rutas, y repite hasta exit 0. Con `--json` tienes la lista exacta de huérfanas.
- Si se rehizo el build tras generar `vercel.json`, vuelve a correr `check-redirects` (el gate es sobre el `dist/` final).

## Límites (fuera de alcance: avisar, no improvisar)

Sin carrito/e-commerce · sin áreas con login · sin formularios con backend (se reconstruyen con un servicio o
Worker, acordado aparte) · idiomas solo **es/en** (hreflang en `migration.md` §4) · **≤ 300 páginas** (se avisa y
se trunca) · sin contenido tras paywall · sin scraping de terceros sin autorización.

## Cuándo escalar a una persona (no lo resuelvas tú)

- **Legal**: autorización dudosa, sitio de un tercero, términos que prohíben rastreo, DMCA/cesión de derechos.
- **Propiedad del contenido**: textos o fotos que el cliente no escribió/compró (stock sin licencia, reseñas copiadas de
  Google/Yelp, contenido de un proveedor anterior que reclama autoría).
- **Afirmaciones que requieren licencia o prueba**: certificaciones, títulos profesionales, "nº 1 en…", claims médicos
  o financieros, premios: se migran solo si el cliente aporta la evidencia; si no, `PLACEHOLDER` y se reporta.
- **Datos de negocio** con `confidence` ≠ `high` (NAP, horario, precios) y **política de rastreadores IA**: los decide el cliente.
- **Cambio de dominio**: requiere el procedimiento de Search Console (`migration.md` §5) y aprobación.

## Informe final (formato)

```markdown
# Migración — <sitio viejo> → <dominio nuevo> — <fecha>

**Autorización:** <quién · base> (`migration/AUTHORIZATION.md`) · **Origen:** url|dir|repo · stack <detectado>
**Veredicto:** ENTREGABLE | ENTREGABLE CON RESERVAS | NO ENTREGABLE (paridad fallida)

## Inventario
- Páginas N (page N · post N) · skipped N (robots N · redirect N · draft/private N · js-only N) · warnings N

## Auditoría del sitio antiguo (resumen para el cliente)
- Errores N · enlaces rotos N · duplicados N · imágenes pesadas N · Lighthouse móvil: <top 5 o "no ejecutado">

## Extracción
- content/ N archivos · assets/ N imágenes · brief: sources high N / medium N / low N / null N
- Páginas con confidence medium: <lista>

## Reconstrucción (gates del kit, con evidencia pegada)
- astro check · build · Playwright+axe N/N · check-seo 0 err (`--site` = `SITE.url` = dominio de producción) · lhci · PLACEHOLDER pendientes: <lista>

## Redirects y paridad
- redirects.json N reglas (301 N · 410 N) · vercel.json / _redirects escritos · check-redirects: 0 huérfanas (exit 0)

## Requiere decisión humana
- <legal / propiedad / claims / datos medium-low / política IA / dominio>

## Post-lanzamiento
- [ ] Search Console: sitemap nuevo enviado; URLs antiguas → "Página con redirección" · [ ] Bing/IndexNow · [ ] GBP y perfiles con la URL nueva · [ ] `check-redirects` otra vez a los 28 días
```
Reglas: cifras pegadas de los `--json`, sin adjetivos, sin "parece que"; lo no comprobado se declara.
