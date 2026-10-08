---
name: seo-audit
description: |
  Audita el SEO técnico de un sitio estático ya construido (Astro 7 del web-design-kit
  u otro `dist/`): metadatos por ruta, canónicas, Open Graph, JSON-LD, imagen LCP,
  robots/sitemap, 404 real y Lighthouse 13; entrega un informe con correcciones
  priorizadas. Usar antes de publicar, tras cambios en `<head>`/plantillas, cuando
  el cliente pide "revisar el SEO", "por qué no salimos en Google/ChatGPT", o al
  preparar Search Console/Bing. No genera contenido ni investiga keywords.
---

# seo-audit — auditoría SEO técnica de un sitio construido

Doctrina de referencia: `../web-design-kit/references/seo.md` (léela primero si no
está en contexto). Script: `../web-design-kit/scripts/check-seo.mjs`.

Principio: **auditar sobre `dist/`, nunca sobre el código fuente**. Lo que ven Google
y los rastreadores de IA es el HTML prerenderizado final.

## Procedimiento

1. **Construir.** Desde la raíz del proyecto:
   `npm run build` (debe terminar sin errores). Si falla, parar y reportar: no hay
   nada que auditar.

2. **Chequeo estático (obligatorio).**
   `node <ruta>/scripts/check-seo.mjs dist --site https://dominio-real.com`
   - `--site` es la URL de producción del cliente (sin barra final). Sin ella se
     omiten las comprobaciones de canónica/sitemap contra el dominio.
   - Añade `--json` para procesar la salida.
   - Código de salida 1 = hay errores bloqueantes.

3. **Lighthouse 13 (laboratorio).** Una de estas dos:
   - Con config en el proyecto (`lighthouserc.cjs`): `npx lhci autorun`.
   - Sin config: `npx astro preview &` y luego
     `npx lighthouse http://localhost:4321/ --preset=desktop --only-categories=seo,performance,accessibility,best-practices --output=json --output-path=./lh.json --chrome-flags="--headless"`.
   - Objetivo del kit: SEO 100 · Accesibilidad 100 · Performance ≥ 90 · Best Practices ≥ 90.
   - Lighthouse 13 renombró/retiró IDs de auditoría (p. ej. `interactive` ya no
     existe): lee `audits[*].title`, no asumas IDs de versiones ≤ 12.
   - Lighthouse es laboratorio; las CWV reales (LCP 2,5 s / INP 200 ms / CLS 0,1 en
     p75) se leen en Search Console → Core Web Vitals (CrUX) tras ~28 días.

4. **Datos estructurados.** Para la portada y una página de cada tipo (producto,
   artículo, contacto):
   - Pega la URL (o el HTML) en https://search.google.com/test/rich-results y en
     https://validator.schema.org/.
   - Verifica: `Organization`/`WebSite` una sola vez; `LocalBusiness` con NAP igual
     al pie de página; `Article` con `author` + fechas; sin `FAQPage`/`HowTo`
     (retirados); sin datos inventados (teléfonos, direcciones, valoraciones).

5. **Comprobaciones manuales rápidas** (si el sitio ya está desplegado):
   - `curl -sI https://dominio/ruta-inexistente | head -1` → debe ser `404`, no `200`.
   - `curl -s https://dominio/robots.txt` → `Sitemap:` con el dominio real; política
     de rastreadores IA acordada con el cliente.
   - `curl -s https://dominio/sitemap-index.xml` → 200 y URLs del dominio real.
   - `curl -sI https://dominio/` → cabeceras de seguridad (`vercel.json`/`_headers`).
   - Vista previa social: https://www.opengraph.xyz/ (og:image PNG/JPG 1200×630).

6. **Redactar el informe** con el formato de abajo y proponer los cambios concretos
   (archivo + línea cuando sea posible). Aplicar solo lo técnico; lo editorial se
   escala.

## Cuándo escalar a una persona

No lo resuelvas tú ni lo inventes; descríbelo en "Requiere decisión humana":

- **Contenido y E-E-A-T**: textos `PLACEHOLDER`, descripciones genéricas, falta de
  página "Sobre nosotros", autores sin nombre, cifras a cero, ausencia de
  privacidad/aviso legal. Un auditor técnico no redacta el copy del cliente.
- **Datos de negocio**: NAP, horario, precios, categoría de `LocalBusiness`,
  coordenadas. Deben venir del cliente; nunca rellenar con ejemplos.
- **Política de rastreadores IA**: la pregunta "¿permitir búsqueda con IA y bloquear
  solo entrenamiento?" la responde el cliente; aplica su decisión en `robots.txt`.
- **Migraciones**: URLs antiguas que necesitan 301, cambio de dominio, hreflang entre
  mercados. Requieren inventario y aprobación.
- **Penalizaciones o caídas de tráfico** en Search Console: diagnóstico fuera del
  alcance de este chequeo.

## Formato del informe

```markdown
# Auditoría SEO técnica — <sitio> — <fecha>

**Alcance:** dist de `<commit/rama>` · `--site <url>` · Lighthouse 13 (<preset>)
**Veredicto:** LISTO PARA PUBLICAR | PUBLICAR CON RESERVAS | NO PUBLICAR

## Resumen
- check-seo.mjs: N errores · N advertencias · N páginas
- Lighthouse: SEO xx · A11y xx · Perf xx · BP xx (LCP x,x s · CLS x,xx · TBT xx ms)
- Rich Results Test: <tipos válidos> / <errores>

## Errores (bloquean publicación)
| # | Página | Problema | Corrección propuesta (archivo:línea) |

## Advertencias (corregir antes de 30 días)
| # | Página | Problema | Corrección propuesta |

## Requiere decisión humana
- <contenido / datos de negocio / política IA / migraciones>

## Checklist post-deploy
- [ ] Search Console: dominio verificado, sitemap enviado, portada inspeccionada
- [ ] Bing Webmaster Tools: importado desde GSC, IndexNow configurado
- [ ] Google Business Profile (si local): NAP idéntico a la web
- [ ] Revisión a 28 días: CWV en campo, cobertura, informe "IA generativa"
```

Reglas del informe: hechos verificables (pega la línea del script o la métrica de
Lighthouse), sin adjetivos, sin "parece que". Si algo no se pudo comprobar (sin
red, sin dominio), dilo explícitamente en lugar de omitirlo.

## Atajos

```bash
# Auditoría completa local (kit)
npm run build && node ../web-design-kit/scripts/check-seo.mjs dist --site https://dominio.com && npx lhci autorun

# Solo errores, en JSON
node check-seo.mjs dist --site https://dominio.com --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.findings.filter(f=>f.level==="error"))'
```
