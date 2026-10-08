#!/usr/bin/env node
/**
 * check-redirects.mjs — verifica la paridad de URLs entre el sitio antiguo y el build nuevo.
 *
 * Uso:
 *   node check-redirects.mjs <inventory.json> <dist> [--redirects <redirects.json>] [--json] [--help]
 *
 * Para cada URL antigua del inventario (status < 400) sigue la cadena de redirects (máx. 5 saltos) y exige
 * un archivo en <dist> (`<ruta>/index.html`, `<ruta>` con extensión o `<ruta>.html`) o un 410 explícito.
 * Reporta huérfanas, bucles y conflictos (dos orígenes → mismo destino final sin `reason`). Exit 1 si hay alguno.
 *
 * --redirects acepta redirects.json (`[{from,to,status,reason}]`) o un vercel.json (se lee su bloque `redirects`).
 * vercel.json no guarda `reason`, así que con esa entrada NO se evalúan conflictos (solo huérfanas y bucles); el gate
 * completo es con redirects.json.
 *
 * Cero dependencias. Node ≥ 22. Exit 1 en error fatal, 0 en informativo.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkRedirects, MAX_HOPS } from './lib/redirects.mjs';

const HELP = `check-redirects.mjs — paridad de URLs antiguas contra dist/ + redirects

Uso:
  node check-redirects.mjs <inventory.json> <dist> [--redirects <redirects.json|vercel.json>] [--json]

Opciones:
  --redirects <archivo>  redirects.json generado por plan-redirects.mjs (gate completo) o un vercel.json con bloque
                         "redirects" (sin "reason": se comprueban huérfanas y bucles, no conflictos).
  --json                 Imprime el informe completo en stdout.
  --help                 Esta ayuda.

Cada URL antigua debe terminar (tras máx. ${MAX_HOPS} saltos) en un archivo de dist/ o en un 410 explícito.
Exit 1 si hay huérfanas, bucles o conflictos (dos orígenes → mismo destino final sin "reason").
Windows + Git Bash: pasa rutas sin barra inicial o usa MSYS_NO_PATHCONV=1.
`;

function parseArgs(argv) {
  const opts = { inventory: null, dist: null, redirects: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--redirects') opts.redirects = argv[++i];
    else if (a.startsWith('--redirects=')) opts.redirects = a.slice(12);
    else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else if (!opts.inventory) opts.inventory = a;
    else if (!opts.dist) opts.dist = a;
    else throw new Error(`Argumento inesperado: ${a}`);
  }
  return opts;
}

function readJson(file, label) {
  if (!existsSync(file)) throw new Error(`${label} no encontrado: ${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${label} no es JSON válido (${file}): ${err.message}`);
  }
}

/**
 * Acepta redirects.json (array) o vercel.json (`redirects: [{source, destination, permanent}]`).
 * @returns {{list: object[], format: 'plan'|'vercel', hasReasons: boolean}} `hasReasons` es false para vercel.json
 *   (no guarda `reason`), y entonces check-redirects no evalúa conflictos.
 */
export function loadRedirects(file) {
  const data = readJson(file, 'redirects');
  if (Array.isArray(data)) return { list: data, format: 'plan', hasReasons: true };
  if (data && Array.isArray(data.redirects)) {
    const list = data.redirects.map((r) =>
      'source' in r
        ? { from: r.source, to: r.destination, status: r.permanent === false ? 302 : 301, reason: r.reason }
        : r,
    );
    return { list, format: 'vercel', hasReasons: false };
  }
  throw new Error(`Formato de redirects no reconocido: ${file}`);
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    console.error(HELP);
    process.exit(1);
  }
  if (opts.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (!opts.inventory || !opts.dist) {
    console.error('Error: se requieren <inventory.json> y <dist>\n');
    console.error(HELP);
    process.exit(1);
  }
  let report;
  try {
    const inventory = readJson(opts.inventory, 'inventory.json');
    if (!existsSync(opts.dist) || !statSync(opts.dist).isDirectory()) {
      throw new Error(`dist no es una carpeta: ${opts.dist} (¿ejecutaste el build?)`);
    }
    const loaded = opts.redirects ? loadRedirects(opts.redirects) : { list: [], format: 'plan', hasReasons: true };
    report = checkRedirects(inventory, opts.dist, loaded.list, { conflicts: loaded.hasReasons });
    report.redirectsFormat = loaded.format;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const conflictsLabel = report.conflictsChecked ? `${report.conflicts.length} conflictos` : 'conflictos: no evaluados (vercel.json sin "reason"; usa redirects.json para el gate completo)';
    console.log(
      `Paridad: ${report.checked} URLs antiguas · ${report.redirected} redirigidas · ${report.gone} eliminadas (410) · ${report.orphans.length} huérfanas · ${report.loops.length} bucles · ${conflictsLabel}`,
    );
  }
  if (report.orphans.length) {
    console.error(`\nHuérfanas (${report.orphans.length}): URLs antiguas sin archivo en dist/ ni redirect:`);
    for (const o of report.orphans) {
      console.error(o.hops ? `  ${o.from} → ${o.resolvedTo} (sin archivo en dist)` : `  ${o.from} (sin archivo en dist)`);
    }
  }
  if (report.loops.length) {
    console.error(`\nBucles o cadenas > ${MAX_HOPS} saltos (${report.loops.length}):`);
    for (const l of report.loops) console.error(`  ${l.chain.join(' → ')}`);
  }
  if (report.conflicts.length) {
    console.error(`\nConflictos (${report.conflicts.length}): varios orígenes terminan en el mismo destino sin "reason":`);
    for (const c of report.conflicts) console.error(`  → ${c.to}  desde: ${c.froms.join(', ')}`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
