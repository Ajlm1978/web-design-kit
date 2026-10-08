# DECISIONS — web-design-kit

Formato: fecha · decisión · motivo · alternativa descartada · reversible.

## 2026-10-07 — Instalación del arnés y reescritura v2.0.0
- **Commit auditado:** `2dd5090` (main, al día con origin). Repo de 8 archivos/14 KB, un commit (jun-2026), sin secretos, sin inyección de prompts, manifiesto válido.
- **Hallazgos de la auditoría (todos atendidos en v2):**
  - [ALTA] Stack obsoleto y arquitectónicamente equivocado para SEO (Vite SPA, Tailwind 3, react-router 6, títulos por `useEffect`, rewrite SPA que genera soft-404) — capa tarea/verificación.
  - [ALTA] Sin verificación: ningún build, test ni gate; "listo" no era comprobable — capa verificación.
  - [MEDIA] Orquestador delgado: dependía de 3 skills externas y un MCP de pago; no funcionaba solo al invocarlo desde GitHub — capa contexto.
  - [MEDIA] Sin estado entre sesiones ni alcance (WIP) — capa estado.
  - [BAJA] README con ruta local de Windows y acoplamiento a OneDrive — capa entorno.
  - [ALTA, operativa] El usuario pegó un PAT en el chat: se trató como comprometido; no se persistió; feature WDK-006 exige rotación.
- **Astro 7 estático por defecto, Next 16.4 secundario.** Motivo: crawlers IA no ejecutan JS (estudio Vercel/MERJ) y Google exige indexabilidad; coste ≈ 0. Descartado: Vite SPA (SEO), React Router 8 (solo si el cliente lo exige). Reversible: sí (plantillas por caso).
- **Kit autocontenido.** Motivo: "invocar desde GitHub como skill" solo funciona si no depende de instalaciones externas. MCP magic queda como opcional. Reversible: sí.
- **Push directo a `main` con gates verdes**, por instrucción explícita del usuario (el protocolo del arnés recomienda rama + PR; el usuario prevalece). Se trabajó en rama `harness/2026-10-07` y se hace fast-forward a `main` tras `init.sh` verde y `diff --stat` mostrado.
- **TypeScript 5.9.3 en la plantilla (no 7.0.2).** Motivo: `@astrojs/check@0.9.10` peer `^5||^6`. Reversible: cuando check soporte TS 7.
- **Plantilla copiada, no descargada.** `npm create astro --template` necesita GitHub raw (bloqueado en sandbox); copiar es además determinista.
- **`trailingSlash: 'ignore'` en Astro + enlaces/canónicas con barra + `vercel.json trailingSlash:true`.** Probé `'always'`: el preview devuelve 404 plano para `/ruta` sin barra y rompía el test de 404. El host hace la redirección (Cloudflare auto, Vercel config). Reversible: sí.
- **OG por defecto en PNG** (FB/LinkedIn/X no renderizan SVG), generado con sharp desde el SVG. Pendiente WDK-005.
- **Canónica omitida en páginas `noindex`** (la 404 emitía `/404/`). Hallazgo del auditor SEO (maker≠checker).
- **Lighthouse preset mobile** (los umbrales del kit son móviles); job de CI `continue-on-error` hasta estabilizar (WDK-004).
- **Tests axe en light y dark** (18 combos) tras hallazgo de QA.
- **Hero en JPG generado**: Astro 7 no procesa SVG en `<Picture>` sin `dangerouslyProcessSVG`.
- **Retirada la skill `web-workflow`**: la sustituye el router `web-design-kit`.
- **Checks ejecutables por hallazgo:** stack/SEO → `check-seo.mjs` + tests SEO; verificación → `init.sh`; estado → `claude-progress.md` + `feature_list.json`; versiones → `check-versions.mjs`; diseño → rúbrica `design-critique`.
- **No verificado (marcado en docs):** fechas de transición de la EAA, términos del plan Hobby de Vercel, estado "legacy" de Cloudflare Pages, soft-nav CWV en Chrome 151, comportamiento de `claude plugin validate` en runner sin auth. Los docs lo señalan como "re-verificar".

## 2026-10-08 — /migrate-site (WDK-007)
- **Rutas dinámicas del CMS (`/tag/`, `/author/`) en modo dir/repo → `unresolved`, no rotas.** El fixture `wp-like` enlaza a ellas pero en una carpeta estática no existen; `audit-site` las lista como "no verificables" (por URL sí se verifican con el status real). Alternativa descartada: contarlas como 404 (falsos positivos en todo export de WordPress). Reversible: sí.
- **URLs que redirigen (301/302) son `skipped.reason: 'redirect'`, no páginas.** Se registra `status/finalUrl` y se sigue el destino si es del mismo origen; la URL antigua cuenta para paridad vía inventario+skipped, no duplica contenido. Descartado: incluirlas en `pages` (inflaba conteos y duplicaba `contentHash`).
- **Rutas literales de `Disallow` en robots.txt se registran como `skipped.reason: 'robots'`** aunque nadie las enlace (p. ej. `/privado/`): el cliente ve qué quedó fuera por decisión del sitio, y `check-redirects` las cubre en paridad. Descartado: ignorarlas en silencio.
- **`html-to-md` conserva `<header>`/`<footer>` dentro de `<article>`** (son cabecera/pie del artículo: título, fecha, autor) y elimina solo los de nivel de página. Descartado: eliminar todo header/footer (perdía fechas y autores de posts WordPress).
- **`node --test` exige el glob `test/*.test.mjs`.** `node --test <dir>` falla en Node 22.22 (no recorre carpetas); se documenta en `init.sh`, CI y CLAUDE.md del plan. Reversible: cuando Node lo soporte de forma estable.
- **`scan-source` registra `source.root`** (carpeta escaneada) en `inventory.json` para que `extract-content` lea CSS e imágenes del disco sin repetir el argumento; para repos clonados en tmp queda `null` y se usa `--source-root`. Descartado: pasar siempre la carpeta a mano.
- **Regla de conflicto en redirects: dos `from` distintos → mismo `to` final y cualquiera de ellos sin `reason` explícito = conflicto (exit 1).** Una fusión intencional se declara con `{to, reason}` en `mapping.json`; el `reason` automático de "slug cambiado" no cuenta como explícito (el de "301 al padre" sí, porque dos descartadas pueden compartir padre legítimamente). Descartado: tolerar fusiones silenciosas (ocultan errores de mapeo).
- **410 soportado en `redirects.json` y `check-redirects` (destino terminal válido), pero excluido de `vercel.json` y `_redirects`** (ningún host estático lo expresa en esos archivos; se gestiona en servidor/edge y queda comentado en `_redirects`). Descartado: emitir 410 como 301 a la home.
- **El test Playwright de blog usa un `outDir` aislado** (build propio con un post de prueba creado en `beforeAll` y borrado en `afterAll`) para no contaminar `dist/` ni el estado "sin posts" del resto de tests. Descartado: escribir el post en `src/content/blog/` del template y confiar en la limpieza.
- **Flag `showBlog` en `src/config/site.ts`** controla "Blog" en el menú y la entrada de `/blog/` en el sitemap; sin posts la ruta responde 200 `noindex`. Descartado: detectar posts en el Header en tiempo de build (acoplaba componente y colección).
- **`z` importado desde `astro/zod`** en `content.config.ts`: `z` desde `astro:content` está deprecado y se retira en Astro 8. Reversible: no hace falta.

## 2026-10-08 — correcciones QA /migrate-site (WDK-007)
- **El nombre del archivo del post ES el slug de la URL.** `extract-content` escribe `content/blog/<último segmento>.md` y la plantilla sirve `/blog/<nombre de archivo>/`: copiar sin renombrar conserva la URL (H-01). Posts fuera de `/blog/` (permalinks por fecha) van a `/blog/<slug>/` con `targetPath` en `brief.pages[]` y `plan-redirects --brief` emite el 301. Descartado: `postSlug` solo en frontmatter (obligaba a renombrar a mano) y `slugFromPath` completo (`blog-post-01`, rompía la paridad).
- **Ruta sin mapping = sin cambios; `--strict` opcional.** `check-redirects` contra `dist/` es el único sitio donde se sabe si una ruta existe; exigir listarlas todas en `mapping.json` contradecía la skill y daba exit 1 en el camino feliz (H-03). Descartado: mantener el error y cambiar la skill (más fricción, mismo gate al final).
- **`check-redirects` con `vercel.json` no evalúa conflictos.** Vercel no guarda `reason`; evaluar conflictos sin esa información produce falsos positivos (H-04). El gate completo es con `redirects.json`; la salida lo dice. Descartado: inventar `reason` al fusionar en `vercel.json` (Vercel rechaza claves desconocidas).
- **El H1 y el sufijo del sitio no van en el Markdown.** La plantilla pinta el `<h1>` desde `title` y `Base` añade " · Sitio": dejarlos en el cuerpo/título duplicaba H1 y nombre (H-02/H-06, 33 errores de `check-seo`). Se elimina solo el primer H1 que coincide con el título (un H1 distinto se conserva). Descartado: `as="h2"` en el snippet (la página quedaba sin H1 semántico).
- **`html-to-md` elimina `<footer>` y `entry-meta` dentro de `<article>`, conserva el `<header>`.** Fecha, autor y etiquetas ya se extraen al frontmatter desde el árbol HTML; en el cuerpo eran ruido con enlaces a `/author/` y `/tag/` (H-07). Revierte parcialmente la decisión anterior "conserva header/footer del artículo".
- **Enlaces internos relativos a la raíz; imágenes absolutas hasta descargarlas.** Los enlaces se reescriben (`/servicios/`) para no depender del host viejo; las imágenes se mantienen absolutas porque `rewriteImageLinks` las casa con `images[].src` y las sustituye por `../assets/<archivo>` tras `--download-images`; las no descargadas quedan señaladas (`images[].local === null`) para `PLACEHOLDER`.
- **Las URL 4xx/5xx no son páginas del cliente.** `audit-site` no las audita (no tienen título/descripción porque no existen) y las cuenta como `errorPages`/destinos rotos; `summary.pages` = páginas que responden, `summary.inventoried` = entradas del inventario, `brokenTargets` = destinos únicos (H-05). Descartado: seguir contando aristas + páginas de error como "destinos" (inflaba el informe vendible).
- **El fixture `wp-like` incluye archivos `/tag/` y `/author/` reales.** Un WordPress real los sirve (200) y entran en el inventario: el fixture debe estresar su decisión en `mapping.json` (descartar → padre o → `/blog/` con `reason`). Con un servidor estático simple ya no hay 404 "accidentales" (antes 12), y `cases/04` describe lo que de verdad produce (H-10). Descartado: corregir solo los esperados del caso.
