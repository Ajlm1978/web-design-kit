# Cómo ejecutar un eval (manual, con Claude Code)

Tiempo estimado por caso: 45–90 min (construcción) + 20 min (auditoría).
No hay script que lo haga por ti; la gracia es observar qué hace el agente con un prompt real.

## Requisitos
- Node ≥ 22.12, npm, Chromium para Playwright (`npx playwright install chromium`).
- Claude Code con el marketplace instalado:
  ```
  /plugin marketplace add Ajlm1978/web-design-kit
  /plugin install web-design-kit@amilcar-web-kit
  ```
  (o, para probar la copia local: `claude --plugin-dir ./plugins/web-design-kit`).
- Un directorio vacío por caso, fuera de este repo: `mkdir ~/evals/01 && cd ~/evals/01`.

## Procedimiento

### 1. Construcción (sesión A)
1. Abre Claude Code en el directorio vacío. Anota `claude --version` y el modelo activo (`/model`).
2. Pega el **prompt tal cual** está en el caso. No añadas pistas ("usa el kit", "usa Astro").
   Si el agente pregunta, responde con la sección **Respuestas a preguntas** del caso; si pregunta
   algo no previsto, inventa un dato razonable y anótalo.
3. Deja que termine. No corrijas nada durante la construcción; apunta lo que harías.
4. Al terminar, guarda la transcripción (`/export` o copia) junto al resultado.

### 2. Auditoría (sesión B — otra sesión, otro contexto)
Maker ≠ checker: abre una **sesión nueva** de Claude Code en el mismo directorio (o un
subagente limpio) y pega:

```
Audita este sitio contra plugins/web-design-kit/skills/web-design-kit/references/quality-gates.md
y después aplica la skill design-critique. No construiste nada aquí. Ejecuta cada comando,
pega la salida real y reporta hallazgos con archivo:línea. No corrijas nada.
```

Sin el kit a mano, ejecuta tú los comandos de la tabla de gates y rellena la plantilla.

### 3. Registro
Crea `evals/results/AAAA-MM-DD-<caso>.md` con esta plantilla:

```markdown
# Resultado — <caso> — AAAA-MM-DD
Claude Code: <versión> · Modelo: <id> · Plugin: web-design-kit@<versión> · SO: <mac/linux/win>

## Construcción
- Duración: <min> · Turnos: <n> · Preguntas que hizo el agente: <lista corta>
- ¿Activó la skill web-design-kit sin pista? sí/no (evidencia: <línea de la transcripción>)
- ¿Scaffoldeó desde templates/astro-marketing? sí/no
- Intervenciones humanas necesarias: <ninguna | lista>

## Gates (quality-gates.md)
| # | Gate | Resultado | Evidencia |
|---|---|---|---|
| 1 | build | ✓/✗ | `npm run build` → … |
| 2 | astro check | ✓/✗ | 0 errores / N errores |
| 3 | axe 375/768/1280 light+dark | ✓/✗ | N serious/critical |
| 4 | check-seo | ✓/✗ | N errores, N warnings |
| 5 | Lighthouse móvil (mediana de 3) | ✓/✗ | perf/a11y/seo/bp = … |
| 6 | JS ≤ 100 KB gz | ✓/✗ | N KB |
| 7 | LCP img ≤ 200 KB | ✓/✗ | N KB, formato |
| 8 | ≤ 3 fuentes | ✓/✗ | N archivos |
| 9 | 0 placeholders | ✓/✗ | grep → … |
| 10 | reduced-motion manual | ✓/✗ | qué se revisó |
| 11 | 404 real | ✓/✗ | código HTTP |
| 12 | metadatos por página | ✓/✗ | … |

## Criterios específicos del caso
<copiar la lista del caso y marcar>

## design-critique
- Hallazgos bloqueantes: N · importantes: N · menores: N
- Los 3 más relevantes: …

## Veredicto
PASA / FALLA en gate(s): <lista>. ¿Bug del kit o del caso? <razonamiento en 2 líneas>
```

### 4. Qué hacer con un fallo
- Falla en un gate técnico (1–5, 11): casi siempre es bug del kit o del template → issue con
  evidencia y la transcripción.
- Falla en presupuesto (6–8) o anti-slop: revisar si la skill da la instrucción y el agente la
  ignoró (bug de redacción de la skill) o si la instrucción no existe (añadirla a `references/`).
- Falla por pregunta no prevista: añade la respuesta a **Respuestas a preguntas** del caso.

## Advertencias
- No compares dos ejecuciones como si fueran deterministas. Compara contra los gates.
- No "ayudes" durante la construcción: contamina el eval. Anota y sigue.
- Las capturas y `dist/` no van al repo; solo el `.md` del resultado.
