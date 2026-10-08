# claude-progress — web-design-kit

## Estado verificado (2026-10-07)
- Kit v2.0.0 en rama `harness/2026-10-07`, listo para `main`.
- Gates: ver evidencia de la Sesión 0. Reproducir con `./init.sh`.
- Feature activa: ninguna (WDK-001 passing). Siguiente sugerida: WDK-006 (humano) y WDK-002.

## Sesión 0 — 2026-10-07 (arquitectura + arnés + v2.0.0)
**Hecho**
- Auditoría del repo original (1 commit, orquestador delgado, stack obsoleto) → ver DECISIONS.md.
- Investigación de estado del arte oct-2026 (frameworks, CSS, motion, SEO/GEO, a11y/EAA, Agent Skills, hosting) y verificación de versiones en npm en vivo.
- Equipo de 5 agentes en paralelo (template Astro, tokens/diseño, motion, SEO, calidad/CI) + corrección de 7 defectos hallados por los auditores.
- Plantilla `astro-marketing`, 3 skills, 2 comandos, 10 referencias, 3 scripts, snippets de motion, CI, evals, arnés.

**Evidencia (resumida)**
- `npm run check`: 0 errors/0 warnings (19 archivos) · `npm run build`: 3 páginas en ~1 s.
- `npm test`: 26 passed (axe light+dark × 375/768/1280 × 3 páginas; 8 SEO).
- `check-seo.mjs dist --site https://example.com`: 0 errores, 6 avisos (todos PLACEHOLDER esperados).
- `tokens-to-theme.mjs --check`: OK, idempotente; build con `@theme` generado OK.
- `check-versions.mjs`: 23 paquetes, 1 drift MAJOR intencional (TS).
- `claude plugin validate .`: passed.

**Pendientes**
- WDK-006: el humano debe rotar el PAT expuesto.
- WDK-002/003/004/005 en `feature_list.json`.
- Snippets `assets/motion/reveal.css` duplican selectores de `templates/.../motion.css`: no importar ambos (documentado en motion.md).

**Decisiones**: ver DECISIONS.md (sección 2026-10-07).
