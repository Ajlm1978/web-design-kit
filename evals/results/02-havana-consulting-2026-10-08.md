# Eval WDK-002 — Havana Consulting LLC (tipo `local`) — 2026-10-08

**Entorno:** Windows 11, PowerShell, Claude Code CLI 2.1.294 (Opus 5.5, Max), Node 24.14, Git Bash, carpeta `C:\dev\eval-wdk`.
**Instalación:** `claude plugin marketplace add Ajlm1978/web-design-kit` (clon HTTPS, sin SSH) + `install` → OK, v2.0.0, 3 skills + 2 comandos, ~582 tok always-on.
**Sesión A (construcción):** `/web-design-kit:new-website HAVANA CONSULTING LLC LOCAL` → 44 min.
**Sesión B:** el propio flujo lanzó `seo-audit` y `design-critique` como agentes separados (maker≠checker dentro de la sesión).

## Resultado
| Gate | Resultado |
|---|---|
| Brief | 1 ronda, 8 preguntas con defaults; parseó nombre sin comillas |
| Línea base | Plantilla compiló en verde en Windows antes de tocar nada |
| Dirección de diseño | Editorial serif (Newsreader + Public Sans, verde-azulado "persianas de La Habana"); DESIGN.md escrito |
| Datos | Tel/email reales en E.164; dirección/horario/equipo/precios/licencias → PLACEHOLDER; cifras falsas eliminadas |
| Páginas | 7 (inicio, servicios, nosotros, contacto, reservar-cita, blog vacío noindex, 404) |
| `astro check` | 0 errores |
| `npm test` | 50/50 (axe 7 páginas × 3 viewports × light/dark + SEO) |
| `check-seo` | 0 errores, 1 aviso (falso positivo, corregido en el kit) |
| Lighthouse móvil | Perf 99–100 · A11y 100 · BP 100 · SEO 100 · LCP 1,8 s · CLS 0 |
| design-critique | 8/10; 5 hallazgos bloqueantes corregidos |
| seo-audit | 4 fixes técnicos aplicados; 4 dependen del cliente |
| Decisiones de producto | Quitó el formulario sin backend; cita vía `mailto:` RFC 6068; blog noindex hasta el primer post |

**Veredicto:** PASA. Sitio no publicable solo por datos del cliente (dominio, dirección, horario, equipo, precios).

## Hallazgos sobre el kit (todos corregidos en v2.0.1 salvo los marcados)
1. `lighthouserc.cjs` usaba `preset: 'mobile'` — valor inválido; Lighthouse no corría. → sin preset (móvil es default).
2. LHCI subía informes a `temporary-public-storage`. → `filesystem`.
3. La 404 (noindex) nunca podía aprobar SEO. → `assertMatrix` sin SEO para `/404.html`.
4. `SEO.astro` omitía la canónica en cualquier `noindex` (afectaba a `/blog/`). → solo en la 404.
5. `check-seo.mjs` regex `robots-disallow-all` cruzaba grupos de user-agents. → evalúa por bloque.
6. `Section tone="ink"` en modo oscuro se confundía con el fondo. → tokens `--color-band`/`--color-band-ink`.
7. Git Bash convierte `/ruta` en rutas de Windows en el script de capturas. → nota `MSYS_NO_PATHCONV=1` en design-critique.
8. La skill no preguntaba si un negocio `local` tiene dirección física antes de emitir `LocalBusiness`. → pregunta obligatoria en el brief.
9. `ogLocale` fijo en `es_ES`. → derivado del país en el brief.
10. README no decía que hace falta el CLI de Claude Code, Node y Git. → sección Requisitos.
11. (pendiente, WDK-007) No existe flujo "auditar sitio ajeno por URL → migrar contenido → rehacer con el kit".
12. (pendiente) El MCP `magic` declarado avisa al arrancar sin `MAGIC_API_KEY`; evaluar moverlo a opt-in real.

## Observaciones de uso
- Sin comillas en el nombre funcionó; documentarlo.
- La tipografía elegida (Newsreader/Public Sans) difiere de la receta base (Fraunces/Inter): la skill adaptó la dirección al cliente, como debe.
- Duración 44 min es aceptable para 7 páginas con auditorías; Lighthouse en Windows fue el paso más lento.
