#!/usr/bin/env bash
# init.sh — verificación real del web-design-kit. Falla rápido; no maquilla verdes.
# Uso: ./init.sh [--quick]   (--quick: sin Playwright/tests)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TPL="$ROOT/plugins/web-design-kit/templates/astro-marketing"
KIT="$ROOT/plugins/web-design-kit/skills/web-design-kit"
QUICK="${1:-}"
IGNORE_SCRIPTS="${IGNORE_SCRIPTS:-1}"

step(){ printf '\n== %s\n' "$*"; }
need(){ command -v "$1" >/dev/null || { echo "FALTA: $1"; exit 1; }; }

step "Entorno"; need node; need npm
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node >= 22.12 requerido (Astro 7). Tienes $(node -v)"; exit 1; }
node -v; npm -v

step "Manifiestos y skills (sin dependencias)"
node - "$ROOT" <<'JS'
const fs=require('fs'),p=require('path');const root=process.argv[2];let bad=0;
for(const f of ['.claude-plugin/marketplace.json','plugins/web-design-kit/.claude-plugin/plugin.json','plugins/web-design-kit/.mcp.json']){
  try{JSON.parse(fs.readFileSync(p.join(root,f),'utf8'));console.log('ok',f)}catch(e){console.log('ERROR',f,e.message);bad++}}
const skills=p.join(root,'plugins/web-design-kit/skills');
for(const d of fs.readdirSync(skills)){const s=p.join(skills,d,'SKILL.md');if(!fs.existsSync(s)){console.log('ERROR sin SKILL.md',d);bad++;continue}
  const t=fs.readFileSync(s,'utf8');const m=t.match(/^---\n([\s\S]*?)\n---/);const fm=m?m[1]:'';
  const name=(fm.match(/^name:\s*(.+)$/m)||[])[1];const hasDesc=/^description:/m.test(fm);
  if(name!==d||!hasDesc){console.log('ERROR frontmatter',d,{name,hasDesc});bad++}else console.log('ok skill',d)}
if(bad){process.exit(1)}
JS
if command -v claude >/dev/null; then claude plugin validate "$ROOT" | tail -1; else echo "(claude CLI no disponible: validación oficial omitida)"; fi

step "Tests migrate (node:test)"
# Glob obligatorio: `node --test <dir>` falla en Node 22.22 (no recorre directorios).
MIGRATE_LOG="$(mktemp)"
if (cd "$ROOT" && node --test "plugins/web-design-kit/skills/web-design-kit/scripts/migrate/test/*.test.mjs" >"$MIGRATE_LOG" 2>&1); then
  grep -E '^# (tests|pass|fail)' "$MIGRATE_LOG"; rm -f "$MIGRATE_LOG"
else
  tail -40 "$MIGRATE_LOG"; rm -f "$MIGRATE_LOG"; echo "ERROR: tests de migrate en rojo"; exit 1
fi

step "Plantilla astro-marketing: install (IGNORE_SCRIPTS=$IGNORE_SCRIPTS)"
cd "$TPL"
if [ "$IGNORE_SCRIPTS" = "1" ]; then npm ci --ignore-scripts --no-fund --no-audit; else npm ci --no-fund --no-audit; fi

step "astro check"; npm run check
step "build"; npm run build
step "check-seo"; node "$KIT/scripts/check-seo.mjs" dist --site https://example.com
step "tokens --check"; node "$KIT/scripts/tokens-to-theme.mjs" "$KIT/assets/tokens.example.json" src/styles/global.css --check

if [ "$QUICK" != "--quick" ]; then
  step "Playwright + axe + SEO tests"
  npx playwright install chromium >/dev/null 2>&1 || echo "(no se pudo instalar Chromium: tests omitidos)" 
  CI=1 npm test
fi

step "Limpieza"; cd "$TPL" && rm -rf dist .astro test-results playwright-report
echo; echo "OK — kit verificado $(date -u +%Y-%m-%dT%H:%MZ)"
