# Deploy — Cloudflare Workers Static Assets (recomendado) vs Vercel

Un sitio del kit es **estático** (`astro build` → `dist/`). Cualquier CDN lo sirve; la decisión
es coste, control de cabeceras y 404 real.

## 0. Decisión rápida

| Caso | Elige |
|---|---|
| Sitio de marketing estático (el 90 % del kit) | **Cloudflare Workers Static Assets** |
| Next.js, ISR, funciones server, el cliente ya está en Vercel | **Vercel** |
| El cliente exige su hosting (cPanel, S3…) | sube `dist/` + replica las cabeceras del §4 |

## 1. Cloudflare Workers Static Assets (recomendado)

- **Coste**: plan Free de Workers; las peticiones a assets estáticos **no cuentan** como
  invocaciones del Worker → un sitio estático sale **~0 $**. Sin límite de ancho de banda
  publicado para assets (verifica el pricing vigente antes de prometerlo a un cliente).
- **Pages**: sigue funcionando, pero Cloudflare recomienda **Workers con Static Assets para
  proyectos nuevos** y ha ido concentrando ahí las novedades. No arranques proyectos nuevos en
  Pages. (Hay guía de migración Pages → Workers en los docs de Cloudflare.)

### 1.1 `wrangler.jsonc` (ya en el template)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mi-sitio",                 // nombre del Worker = subdominio <name>.<cuenta>.workers.dev
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",      // sirve dist/404.html con estado 404 real
    "html_handling": "auto-trailing-slash" // /contacto → /contacto/ (una URL canónica)
  }
}
```

Sin `main` → no hay código de Worker, solo assets. Si más adelante necesitas rutas on-demand
(formulario server-side), añade `@astrojs/cloudflare` y `main`; ver `versions.md`.

### 1.2 Cabeceras y redirecciones
- `public/_headers` → se copia a `dist/_headers`. El template ya trae las cabeceras del §4
  y `Cache-Control: immutable` para `/_astro/*`.
- `public/_redirects` → una línea por regla: `/vieja-url /nueva-url 301`. Máx. 2 000 reglas
  estáticas + 100 dinámicas. Para redirigir dominios enteros (www → apex) usa una **Redirect
  Rule** en el dashboard, no `_redirects`.

### 1.3 Comandos

```bash
npm i -D wrangler            # o npx; versión ≥ 4 (no fijada en versions.md: `npm view wrangler version`)
npx wrangler login
npm run build && npx wrangler deploy          # producción
npx wrangler versions upload                  # sube una versión SIN publicarla → URL de preview
npx wrangler deployments list                 # historial / rollback: `wrangler rollback`
```

### 1.4 Preview deploys
- **Manual**: `wrangler versions upload` devuelve una URL `<hash>-<name>.<cuenta>.workers.dev`.
- **Automático por PR**: conecta el repo en *Workers & Pages → Create → Import a repository*
  (Workers Builds). Cada PR obtiene una **preview URL** y cada merge a `main` despliega. Build
  command `npm run build`, deploy command `npx wrangler deploy`. Necesita `package-lock.json` en el
  directorio raíz que configures.
- Las previews son públicas por defecto: no subas datos reales de cliente antes de firmar.

### 1.5 Dominio propio
1. Dominio en Cloudflare (nameservers apuntando a CF) — si no, transfiere la zona DNS primero.
2. Worker → *Settings → Domains & Routes → Add → Custom domain* → `www.cliente.com`. Cloudflare
   crea el registro DNS y el certificado solo.
3. Apex `cliente.com` → segunda custom domain o Redirect Rule a `www` (elige **una** canónica y
   ponla en `site` de `astro.config.mjs`).

## 2. Vercel

- Óptimo para **Next.js** (es su casa) y cualquier cosa con SSR/ISR. Para Astro estático funciona
  perfectamente, pero no aporta nada sobre Cloudflare y su plan gratuito tiene letra pequeña.
- **Plan Hobby**: históricamente **solo uso personal/no comercial**. Un sitio de un cliente que
  factura **debe** ir en plan Pro (≈ 20 $/mes por miembro) o en la cuenta del propio cliente.
  → **Verifica los términos vigentes** (https://vercel.com/docs/plans/hobby) antes de decidir.
- **404 real**: Vercel detecta `dist/404.html` y lo sirve con estado 404 **si no lo rompes**.
  Nunca añadas un rewrite catch-all tipo SPA (`"/(.*)" → "/index.html"`): convertiría toda URL
  inexistente en un 200 con la portada = soft-404 para Google. El `vercel.json` del template
  solo lleva cabeceras y lo advierte en `_comment`.

### 2.1 `vercel.json` (ya en el template)
Solo `headers` (§4) y, si hace falta, `redirects`:

```json
{
  "redirects": [
    { "source": "/servicios-antiguos", "destination": "/servicios/", "permanent": true }
  ]
}
```

Framework preset: **Astro** (lo detecta). Output: `dist`. Node 22 en *Settings → General*.

### 2.2 Comandos y previews
```bash
npm i -g vercel && vercel login
vercel                 # preview deploy → URL única
vercel --prod          # producción
```
Con el repo conectado, cada PR genera una preview automáticamente y `main` va a producción.

### 2.3 Dominio propio
*Project → Settings → Domains → Add*. Vercel indica el registro: `A 76.76.21.21` para apex o
`CNAME cname.vercel-dns.com` para subdominios (comprueba los valores que te muestre el dashboard,
pueden cambiar). Redirección apex ↔ www se configura ahí mismo.

## 3. Checklist DNS y dominio (ambas plataformas)

- [ ] Elegida **una** URL canónica (`https://www.cliente.com` o `https://cliente.com`); la otra
      redirige 301. Coincide con `site` en `astro.config.mjs`.
- [ ] TTL de los registros a 300 s **antes** del cambio; subir a 3600+ cuando esté estable.
- [ ] Registros que **no** tocar al migrar: `MX`, `TXT` (SPF/DKIM/DMARC), `_dmarc`, verificaciones
      de Google/Meta. Exporta la zona antes de cambiar nameservers.
- [ ] HTTPS activo y `http://` redirige a `https://` (ambas plataformas lo hacen solas).
- [ ] `HSTS` solo cuando **todo** (incl. subdominios) va por HTTPS; `preload` es irreversible en la
      práctica — quita `preload` si el cliente tiene subdominios legacy en HTTP.
- [ ] Propagación comprobada desde fuera: `dig +short www.cliente.com @1.1.1.1` y
      https://dnschecker.org.
- [ ] CAA opcional pero recomendado: `0 issue "letsencrypt.org"` / `"pki.goog"` / `"digicert.com"`
      según la plataforma emita (CF usa varios; consulta antes de restringir).

## 4. Cabeceras de seguridad (las que lleva el template)

| Cabecera | Valor | Por qué |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests` | Astro inyecta `<style>`/`<script>` inline → `'unsafe-inline'` es el precio. Si añades analítica o un formulario externo, añade su origen a `script-src`/`connect-src`/`form-action`. Evalúa con https://csp-evaluator.withgoogle.com |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | 2 años. Ver aviso HSTS en §3 |
| `X-Content-Type-Options` | `nosniff` | Sin sniffing MIME |
| `X-Frame-Options` | `DENY` | Redundante con `frame-ancestors`, lo entienden navegadores viejos |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No filtra rutas a terceros |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Desactiva APIs que no se usan |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aísla la ventana |

Comprueba con https://securityheaders.com (objetivo: A) y https://observatory.mozilla.org.

## 5. Caché

| Ruta | `Cache-Control` | Motivo |
|---|---|---|
| `/_astro/*` (JS, CSS, imágenes con hash) | `public, max-age=31536000, immutable` | El nombre cambia si cambia el contenido |
| `/*.html`, `/` | (defecto de la plataforma; CF: `max-age=0, must-revalidate` en origen + caché de borde con ETag) | Debe actualizarse en cada deploy |
| `/fonts/*` si están en `public/` | `public, max-age=31536000, immutable` | Añade la regla en `_headers`; mejor importarlas vía `@fontsource` para que vayan a `/_astro/` |
| `/sitemap-index.xml`, `/robots.txt` | sin caché larga | Google los relee |

Nunca `immutable` en HTML. Tras el deploy, un hard-reload debe mostrar el cambio; si no, el HTML
tiene caché de más.

## 6. Checklist post-deploy

- [ ] `curl -sI https://www.cliente.com | head -20` → 200, HSTS, CSP, `content-type: text/html; charset=utf-8`.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://www.cliente.com/no-existe` → **404**.
- [ ] `curl -sI https://cliente.com` y `http://www.cliente.com` → **301** a la canónica.
- [ ] `https://www.cliente.com/sitemap-index.xml` responde y lista las páginas reales (no `example.com`).
- [ ] `robots.txt` apunta al sitemap y **no** tiene `Disallow: /` heredado del staging.
- [ ] **Google Search Console**: añadir propiedad de dominio (verificación DNS TXT), enviar sitemap,
      "Inspeccionar URL" en la home y pedir indexación.
- [ ] **Bing Webmaster Tools**: importar desde Search Console (1 clic).
- [ ] **Redirigir URLs antiguas**: si había web previa, mapa `URL vieja → nueva` en `_redirects` /
      `vercel.json` para **todas** las URLs con tráfico o backlinks (saca la lista de Search Console
      → Páginas, y de `site:dominio.com`). 301, no 302.
- [ ] OG/Twitter card: validar en https://www.opengraph.xyz y en el validador de LinkedIn Post Inspector.
- [ ] Lighthouse móvil sobre la URL **de producción** (los gates de `quality-gates.md` se midieron en
      local; el CDN puede cambiar cosas).
- [ ] Formulario de contacto: enviar una prueba real y confirmar que llega.
- [ ] Analítica (si la hay) registrando; dominio añadido a la CSP.
- [ ] Rollback probado una vez: `wrangler rollback` / Vercel → *Deployments → Promote to Production*.
- [ ] Entregar al cliente: accesos (cuenta a su nombre, tú como miembro), dominio renovado > 1 año,
      informe de auditoría (`quality-gates.md`), declaración de accesibilidad si aplica (`a11y-eaa.md`).

## 7. Fuentes para re-verificar
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- `_headers` / `_redirects`: https://developers.cloudflare.com/workers/static-assets/headers/ · /redirects/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Pages → Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- Vercel Hobby fair use: https://vercel.com/docs/plans/hobby · https://vercel.com/docs/limits/fair-use-guidelines
- Vercel `vercel.json`: https://vercel.com/docs/project-configuration
