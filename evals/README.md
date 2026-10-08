# Evals del web-design-kit

Casos de prueba **manuales** para comprobar que el plugin produce sitios que pasan los quality
gates. No hay automatización: un humano (o un agente supervisado) ejecuta cada caso con Claude
Code y rellena el resultado. Ver `run.md` para el procedimiento.

## Qué mide un caso

Cada caso en `cases/` tiene la misma estructura:

1. **Prompt** — lo que teclearía un usuario real, sin pistas sobre el kit.
2. **Artefactos esperados** — archivos y páginas que deben existir al terminar.
3. **Criterios de aprobación** — los gates de
   `plugins/web-design-kit/skills/web-design-kit/references/quality-gates.md`, más los
   específicos del caso (p. ej. JSON-LD `LocalBusiness` válido).
4. **Anti-patrones que fallan el caso** — señales de "slop" o de que la skill no se activó.

Un caso **pasa** solo si todos los criterios se cumplen con evidencia (salida de comando,
captura). "Casi" = falla; se anota el gate que falló.

## Casos

| Archivo | Tipo de sitio | Qué estresa |
|---|---|---|
| `cases/01-corporativo-industrial.md` | Empresa B2B industrial, 5 páginas | Estructura multi-página, tono serio sin caer en plantilla, `Organization` JSON-LD, formulario accesible |
| `cases/02-restaurante-local.md` | Restaurante con una sede | `LocalBusiness` (`Restaurant`) con horario y geo, menú legible en móvil, imágenes pesadas → presupuesto LCP |
| `cases/03-portfolio-creativo.md` | Portfolio de diseñador/fotógrafo | Tentación de JS/animación excesiva vs presupuesto 100 KB, galería accesible, reduced-motion, dark mode real |

## Resultados

Anota cada ejecución en `results/AAAA-MM-DD-<caso>.md` (carpeta ignorada por git si contiene
capturas pesadas; la plantilla está en `run.md`). Un caso que falla dos veces seguidas en el
mismo gate es un bug del kit, no del eval: abre issue con la evidencia.

## Qué NO son estos evals

- No son tests unitarios del plugin (eso lo hace `.github/workflows/ci.yml` sobre el template).
- No miden "belleza"; miden que lo construido pase gates verificables y la crítica anti-slop.
- No garantizan reproducibilidad exacta: el modelo cambia entre versiones. Por eso se anota
  la versión de Claude Code y el modelo en cada resultado.
