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
