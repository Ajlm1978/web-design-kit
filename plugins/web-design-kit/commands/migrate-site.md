---
description: Migra un sitio existente (URL, carpeta/export WXR o repo) al kit sin perder URLs — autorización, inventario, auditoría vendible, extracción a Markdown + brief.json, reconstrucción con /new-website --from y redirects 301 con paridad verificada contra dist/.
argument-hint: "--url <https://…> | --dir <ruta> | --repo <owner/repo> [--max-pages 300] [--render] [--out migration]"
---

# /migrate-site — sitio existente → sitio del kit, con paridad de URLs

Argumentos: `$ARGUMENTS`. Carga la skill **migrate-site** y sigue sus fases 0–5 en orden; **cada gate que
falle detiene el comando** (no se salta ninguna fase, no se "arregla sobre la marcha" sin reportarlo).

## Parseo de argumentos
- Exactamente **uno** de `--url <https://…>` · `--dir <ruta | export.xml>` · `--repo <owner/repo | URL git>`.
  Ninguno o varios → pregunta cuál es el origen antes de seguir.
- `--max-pages <n>` (default 300, solo con `--url`) · `--render` (Playwright para páginas JS-only, solo con
  `--url`) · `--out <dir>` (default `migration`).
- `--build` (solo `--dir`/`--repo` con `package.json` y script `build`) y `--base-url <https://dominio-viejo>`
  (dir/repo: dominio real para que las URLs antiguas no salgan como `localhost`) se pasan tal cual a `scan-source`.
- Si el directorio actual ya tiene `package.json` que no es el proyecto nuevo, pregunta si crear subcarpeta
  (regla "no sobreescribir").
- Windows + Git Bash: `MSYS_NO_PATHCONV=1` o rutas sin barra inicial.

Variables: `M="${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/migrate"` · `OUT=<--out>`.

## Orden de ejecución
0. **Autorización.** Pregunta literal de la skill (sí/no). Sin "sí" explícito → STOP. Con "sí" →
   `$OUT/AUTHORIZATION.md` (quién, fecha, base, origen).
1. **Inventario.** `--url` → `node "$M/crawl-site.mjs" <url> --out "$OUT" [--max-pages n] [--render]`;
   `--dir`/`--repo` → `node "$M/scan-source.mjs" <ruta|repo> --out "$OUT" [--build] [--base-url …]`.
   exit 1 (robots bloquea todo, error fatal) o 0 páginas → STOP y explica. Reporta `skipped`/`warnings`.
2. **Auditoría.** `node "$M/audit-site.mjs" "$OUT/inventory.json" --out "$OUT" [--lighthouse]` (`--lighthouse`
   solo con `--url`). Presenta `audit.md` al cliente como indica la skill y pregunta si seguir. "No" → entrega
   la auditoría y termina.
3. **Extracción.** `node "$M/extract-content.mjs" "$OUT/inventory.json" --out "$OUT" --download-images
   [--source-root <carpeta>]`. Si `brief.json` no valida → STOP con los errores.
4. **Reconstrucción.** Escribe `$OUT/mapping.json` con el cliente y lanza
   `/web-design-kit:new-website --from $OUT/brief.json` (sección 0-bis). Sus gates (check, build, Playwright+axe,
   check-seo, lhci, PLACEHOLDER) deben quedar verdes y debe existir `dist/` final.
5. **Redirects y paridad.**
   `node "$M/plan-redirects.mjs" "$OUT/inventory.json" "$OUT/mapping.json" --out "$OUT" --vercel vercel.json --public public`
   → `node "$M/check-redirects.mjs" "$OUT/inventory.json" dist --redirects "$OUT/redirects.json"`.
   exit 1 (huérfanas, bucles, conflictos) → corrige `mapping.json`, repite 5 (y el build si cambiaron rutas).
   **Sin exit 0 no hay entrega.**

## Cierre
Informe con el formato de la skill (cifras pegadas de los `--json`, veredicto, decisiones humanas pendientes,
checklist post-lanzamiento). Pide a otra sesión `/audit-site` sobre el sitio nuevo (maker ≠ checker).
