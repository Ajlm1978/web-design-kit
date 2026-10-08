---
description: Audita un sitio construido con el kit (o cualquier dist/ estático) con los gates del kit — build, axe, check-seo, Lighthouse — y entrega hallazgos con archivo:línea.
argument-hint: "[ruta del proyecto o de dist/] [--site https://dominio]"
---

# /audit-site — gates de calidad como checker independiente

Argumentos: `$ARGUMENTS`. Actúa como **checker**: no construiste este sitio y no lo "arreglas sobre la marcha" sin reportar.

1. Si es un proyecto (hay `package.json`): `npm ci --ignore-scripts && npm run check && npm run build`. Si es solo `dist/`, salta al paso 3.
2. `npx playwright install chromium && npm test` (si el proyecto tiene tests del kit).
3. `node ${CLAUDE_PLUGIN_ROOT}/skills/web-design-kit/scripts/check-seo.mjs <dist> --site <url>`.
4. `npx lhci autorun` (si hay `lighthouserc.cjs`) o `npx lighthouse <url> --preset=... --output=json`.
5. `grep -rn PLACEHOLDER <dist>`.
6. Aplica las skills `seo-audit` y `design-critique` (rúbrica en `references/design-anti-slop.md`).

Informe: veredicto (LISTO / NO LISTO), tabla de errores y advertencias con archivo:línea y fix, decisiones que requieren humano (contenido, E-E-A-T, política IA), y evidencia resumida de cada gate (`references/quality-gates.md`).
