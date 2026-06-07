---
description: Prepara un proyecto de sitio web (React + Vite + Tailwind + motion) listo para disenar, previsualizar y desplegar en Vercel.
argument-hint: "[nombre del proyecto] [tipo: corporativo|landing|dashboard|portfolio|ecommerce]"
---

# /new-website — Scaffolding de sitio web

Vas a preparar un proyecto de sitio web production-grade. Argumentos del usuario: `$ARGUMENTS`.

Sigue esta secuencia. Aplica Golden Rules: no inventes datos (pregunta lo que falte), y
deja todo verificado antes de declararlo listo.

## 0. Contexto
- Si falta el **nombre** o el **tipo** de sitio, preguntalo (1 sola vez, conciso).
- Detecta si el directorio actual ya es un proyecto (existe `package.json`). Si lo es,
  NO lo sobrescribas: solo agrega los archivos de tooling que falten.

## 1. Base del proyecto (si es nuevo)
Crea un proyecto Vite + React y agrega Tailwind + motion + react-router-dom:
```bash
npm create vite@latest . -- --template react
npm pkg set dependencies.react-router-dom="^6.28.0" dependencies.motion="^12.40.0"
npm pkg set devDependencies.tailwindcss="^3.4.17" devDependencies.postcss="^8.4.49" devDependencies.autoprefixer="^10.4.20"
```
Configura Tailwind (`tailwind.config.js`, `postcss.config.js`, directivas en `src/index.css`).

## 2. Archivos de tooling (crea estos)

**.gitignore**
```
node_modules
dist
dist-ssr
*.local
.env
.env.*
.DS_Store
.vscode/*
!.vscode/extensions.json
.vercel
```

**.gitattributes**
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.avif binary
*.woff binary
*.woff2 binary
*.pdf binary
```

**vercel.json** (rewrite SPA para client-side routing)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**.claude/launch.json** (preview local)
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

**scripts/install-deps.ps1** (solo si el proyecto vive en OneDrive — instala node_modules
fuera de OneDrive via junction; ASCII puro para Windows PowerShell 5.1)
```powershell
$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $PSScriptRoot
$slug = (Split-Path $proj -Leaf).ToLower() -replace '[^a-z0-9]+','-'
$ext  = "C:\dev\$slug"
$extNm = Join-Path $ext "node_modules"
$link  = Join-Path $proj "node_modules"
New-Item -ItemType Directory -Force -Path $ext | Out-Null
Copy-Item (Join-Path $proj "package.json") $ext -Force
if (Test-Path (Join-Path $proj "package-lock.json")) { Copy-Item (Join-Path $proj "package-lock.json") $ext -Force }
Push-Location $ext
try { npm install --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw "npm install fallo" } } finally { Pop-Location }
if (Test-Path (Join-Path $ext "package-lock.json")) { Copy-Item (Join-Path $ext "package-lock.json") $proj -Force }
$need = $true
if (Test-Path $link) { $a=[IO.File]::GetAttributes($link); if ($a -band [IO.FileAttributes]::ReparsePoint) { if ((Get-Item $link).Target -contains $extNm) { $need=$false } } }
if ($need) { New-Item -ItemType Junction -Path $link -Target $extNm | Out-Null }
Write-Host "OK - node_modules -> $extNm (fuera de OneDrive)"
```
Si usas el helper, agrega a `package.json`: `"deps": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-deps.ps1"` y usa `npm run deps` en vez de `npm install`.

**CLAUDE.md** (convenciones del proyecto)
```markdown
# <NOMBRE> — Sitio web

Stack: React + Vite + Tailwind CSS + motion + react-router-dom.

## Convenciones
- Memoria del proyecto en `docs/kb/` (skill project-kb). Leer al iniciar sesion.
- Estandares: Golden Rules (causa raiz, no inventar datos, auditar antes de "listo").
- Sistema de diseno: definido con ui-ux-pro-max; tokens en `tailwind.config.js`.
- Componentes UI: generar/refinar con 21st.dev Magic y ADAPTAR al design system.
- Accesibilidad: contraste AA, focus-visible, prefers-reduced-motion, alt text.
- node_modules NO en OneDrive (junction). Instalar con `npm run deps`.
- Deploy: Vercel (`vercel deploy --prod`). SPA con rewrite en vercel.json.

## Pendientes
- [ ] Datos reales de contacto (no inventar).
- [ ] Backend de formularios, SEO por pagina, sitemap, analytics.
```

## 3. Entorno
- Si estas en OneDrive: corre `npm run deps` (no `npm install` directo).
- Si `python3` falla en Windows (stub de la Store), crea el shim `python3.exe` en el dir real de Python.

## 4. Memoria (KB)
Invoca la skill **project-kb** para crear `docs/kb/` (PROJECT, ARCHITECTURE, CONFIGURATIONS,
ERROR_LOG, SESSIONS) poblada con el estado real del proyecto.

## 5. Sistema de diseno
Invoca **ui-ux-pro-max** con `--design-system "<tipo> <industria> <keywords>"` para obtener
estilo, paleta, tipografia y anti-patrones. Persiste las decisiones en ARCHITECTURE.md.

## 6. Verificar y cerrar
- `npm run build` debe pasar.
- Levanta el preview y revisa legibilidad / responsive / reduced-motion.
- Actualiza `docs/kb/SESSIONS.md`.
- Para publicar: `vercel deploy --prod` (autentica con `vercel login` la primera vez).
