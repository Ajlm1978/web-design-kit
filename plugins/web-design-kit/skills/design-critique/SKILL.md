---
name: design-critique
description: |
  Crítica de diseño independiente de un sitio ya construido con el kit (Astro + Tailwind 4).
  La ejecuta un agente que NO construyó la página: levanta el preview, captura pantallas a
  375/1280 px en light y dark, aplica la rúbrica anti-slop de 10 puntos, comprueba el uso de
  tokens de diseño y devuelve hallazgos con archivo:línea y fix, nunca una nota. Usar cuando
  se pida "critica el diseño", "revisa cómo se ve", "auditoría visual", "¿parece hecho con IA?",
  antes de entregar al cliente o tras un cambio grande de UI.
---

# design-critique — crítica de diseño por un agente independiente

## Regla cero: maker ≠ checker
Si construiste o editaste esta UI en la sesión actual, **no la critiques tú**. Lanza un subagente
nuevo con este SKILL.md y la ruta del proyecto, o pide una sesión limpia. El crítico trabaja
sobre lo que hay en disco y en pantalla, no sobre lo que el constructor dice que hizo.

## Entrada esperada
- Ruta del proyecto (con `dist/` o capaz de hacer `npm run build`).
- Opcional: brief del cliente (sector, público, tono) para juzgar *adecuación*, no solo gusto.

## Procedimiento

### 1. Levantar el preview
```bash
cd <proyecto> && npm run build && npx astro preview --port 4321 --host localhost --ignore-lock &
# Windows + Git Bash: exporta MSYS_NO_PATHCONV=1 antes de pasar rutas tipo `/contacto/` como argumentos,
# o Git Bash las convierte en rutas de disco (C:\\Program Files\\Git\\contacto).
sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/   # espera 200
```

### 2. Capturas a 375 y 1280, light y dark (Playwright, ya está en devDependencies)
Un solo comando desde la raíz del proyecto; deja 4 PNG por página en `critique/`:
```bash
mkdir -p critique && node --input-type=module -e "
import { chromium } from '@playwright/test';
const pages = ['/', '/contacto', '/404'];
const b = await chromium.launch();
for (const scheme of ['light','dark']) for (const w of [375,1280]) {
  const ctx = await b.newContext({ viewport:{ width:w, height:w===375?812:800 }, colorScheme:scheme, reducedMotion:'reduce' });
  const p = await ctx.newPage();
  for (const path of pages) {
    await p.goto('http://localhost:4321'+path, { waitUntil:'networkidle' });
    const name = path==='/'?'home':path.slice(1);
    await p.screenshot({ path:\`critique/\${name}-\${w}-\${scheme}.png\`, fullPage:true });
  }
  await ctx.close();
}
await b.close(); console.log('ok');"
```
Léelas con la herramienta de lectura de imágenes **antes** de opinar. `reducedMotion:'reduce'`
evita capturar estados intermedios de animación; haz una segunda pasada sin él si la crítica
incluye el movimiento.

### 3. Rúbrica anti-slop (10 comprobaciones)
Aplica, una por una, las 10 comprobaciones de
`../web-design-kit/references/design-anti-slop.md`. Para cada una anota **pasa / falla /
no aplica** y, si falla, la evidencia (captura + elemento). No inventes comprobaciones nuevas
aquí: si la rúbrica tiene un hueco, propón el cambio en ese archivo.

### 4. Tokens de diseño: ¿se usan o se esquivan?
El kit define tokens en `src/styles/global.css` (`@theme`, OKLCH, `light-dark()`). Busca fugas:
```bash
# Hex crudo fuera del archivo de tokens (debería dar 0 líneas)
grep -rnE '#[0-9a-fA-F]{3,8}\b' src --include='*.astro' --include='*.tsx' --include='*.css' | grep -v 'src/styles/global.css'
# Colores arbitrarios de Tailwind que saltan el tema
grep -rnoE '\b(bg|text|border)-\[#?[^]]+\]' src | sort | uniq -c | sort -rn | head
# Radios: rounded-2xl/3xl en todo = tarjeta genérica de IA
grep -rnoE '\brounded-(2xl|3xl|full)\b' src | cut -d: -f3 | sort | uniq -c
# Fuente por defecto de la IA
grep -rniE "font-family:.*inter|@fontsource(-variable)?/inter|'Inter'" src package.json
# Sombras y gradientes decorativos sin token
grep -rnoE '\b(shadow-(xl|2xl)|bg-gradient-to-[a-z]+)\b' src | wc -l
```
Lee los números con criterio: `rounded-full` en avatares es correcto; 14 `rounded-2xl` en 6
componentes no lo es. Inter **no está prohibida**, pero si es la única tipografía y el brief no la
pide, es hallazgo (el template trae Fraunces + Inter como par editorial; comprueba que se use el par).

### 5. Comprobaciones visuales mínimas (sobre las capturas)
- Jerarquía: ¿se distingue el h1 del h2 a 375 px sin leer? ¿Hay **un** CTA primario por pantalla?
- Densidad: ¿secciones todas de la misma altura con icono-título-párrafo ×3? (patrón plantilla).
- Dark: ¿contraste y acento siguen funcionando? ¿imágenes con fondo blanco "flotan"?
- 375 px: ¿texto ≥ 16 px, nada cortado, nada de scroll horizontal, objetivos ≥ 44 px?
- 404: ¿tiene personalidad y vuelta a la home, o es la plantilla sin tocar?
- Copy: ¿quedan "Lorem", "PLACEHOLDER", "Tu empresa", claims genéricos ("soluciones innovadoras")?

### 6. Informe: hallazgos, no nota
Formato por hallazgo (orden: bloqueante → importante → menor). Sin puntuación global, sin
"en general está bien": si no hay hallazgos en un área, di "sin hallazgos" y qué revisaste.
```
### H1 — [bloqueante] Tarjetas idénticas rompen la jerarquía (rúbrica #4 "ritmo")
Evidencia: critique/home-1280-light.png, sección "Servicios"; 3 tarjetas mismas medidas/icono/radio.
Dónde: src/pages/index.astro:88-131, src/components/Card.astro:12 (rounded-2xl fijo)
Fix: variar tamaño de la primera tarjeta (col-span-2), quitar icono decorativo, radio desde token
     `--radius-md`; limitar a 2 tarjetas + 1 bloque de texto.
```
Cierra con: lista de comandos ejecutados, capturas generadas y qué **no** pudiste verificar.
El constructor corrige; el crítico re-captura solo las pantallas afectadas y cierra o reabre
cada hallazgo por su ID.

## Qué no hace esta skill
- No corrige código (eso es del constructor).
- No sustituye los gates técnicos de `../web-design-kit/references/quality-gates.md`
  (axe, Lighthouse, check-seo): se ejecutan aparte y antes.
- No decide gusto del cliente: si el brief pide algo que la rúbrica penaliza, reporta la
  tensión y deja la decisión por escrito.
