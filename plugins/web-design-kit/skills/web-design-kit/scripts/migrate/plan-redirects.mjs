#!/usr/bin/env node
/**
 * plan-redirects.mjs — genera el plan de redirects 301 del sitio antiguo al nuevo.
 *
 * Uso:
 *   node plan-redirects.mjs <inventory.json> <mapping.json> --out <dir> [--vercel <vercel.json>] [--public <dir>]
 *                           [--keep <ruta,ruta>] [--json] [--help]
 *
 * Escribe <out>/redirects.json `[{from, to, status, reason}]`. Con --vercel fusiona el bloque `redirects`
 * en ese vercel.json (sin tocar headers ni trailingSlash). Con --public escribe <public>/_redirects (Cloudflare).
 *
 * mapping.json lo escribe el agente: `{ "/old/": "/new/" | null | {to, reason, status} }`
 *   - misma ruta → sin redirect · slug cambiado → 301 · null → 301 al padre más cercano · {status:410} → eliminada.
 *   - Dos orígenes al mismo destino sin `reason` = conflicto → exit 1.
 *   - Páginas del inventario sin entrada en el mapping (salvo posts /blog/ y --keep) → exit 1.
 *
 * Cero dependencias. Node ≥ 22. Exit 1 en error fatal, 0 en informativo.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { planRedirects, mergeVercelRedirects, toCloudflareRedirects } from './lib/redirects.mjs';

const HELP = `plan-redirects.mjs — plan de redirects 301 (sitio antiguo → nuevo)

Uso:
  node plan-redirects.mjs <inventory.json> <mapping.json> --out <dir> [--vercel <vercel.json>] [--public <dir>] [--keep <rutas>] [--json]

Opciones:
  --out <dir>           Carpeta de salida (redirects.json). Obligatoria.
  --vercel <archivo>    Fusiona el bloque "redirects" en ese vercel.json (conserva headers y trailingSlash).
  --public <dir>        Escribe <dir>/_redirects en formato Cloudflare/Netlify.
  --keep <rutas>        Rutas separadas por coma que el sitio nuevo conserva aunque falten en el mapping.
  --json                Imprime el plan completo en stdout.
  --help                Esta ayuda.

mapping.json: { "/old/": "/new/" | null | { "to": "/new/", "reason": "fusionadas", "status": 301 } }
  null = página descartada → 301 al padre más cercano. Dos orígenes al mismo destino sin reason = conflicto (exit 1).
Windows + Git Bash: pasa rutas sin barra inicial o usa MSYS_NO_PATHCONV=1.
`;

function parseArgs(argv) {
  const opts = { inventory: null, mapping: null, out: null, vercel: null, public: null, keep: [], json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a === '--vercel') opts.vercel = argv[++i];
    else if (a.startsWith('--vercel=')) opts.vercel = a.slice(9);
    else if (a === '--public') opts.public = argv[++i];
    else if (a.startsWith('--public=')) opts.public = a.slice(9);
    else if (a === '--keep') opts.keep = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (a.startsWith('--keep=')) opts.keep = a.slice(7).split(',').filter(Boolean);
    else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else if (!opts.inventory) opts.inventory = a;
    else if (!opts.mapping) opts.mapping = a;
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
 * Ejecuta el plan y escribe las salidas. Devuelve `{plan, files}`.
 * @param {{inventory: string, mapping: string, out: string, vercel?: string|null, public?: string|null, keep?: string[]}} opts
 */
export function runPlan(opts) {
  const inventory = readJson(opts.inventory, 'inventory.json');
  const mapping = readJson(opts.mapping, 'mapping.json');
  const plan = planRedirects(inventory, mapping, { keep: opts.keep ?? [] });
  const files = [];

  mkdirSync(opts.out, { recursive: true });
  const redirectsFile = join(opts.out, 'redirects.json');
  writeFileSync(redirectsFile, `${JSON.stringify(plan.redirects, null, 2)}\n`, 'utf8');
  files.push(redirectsFile);

  if (opts.vercel) {
    const current = existsSync(opts.vercel) ? readJson(opts.vercel, 'vercel.json') : {};
    const merged = mergeVercelRedirects(current, plan.redirects);
    mkdirSync(dirname(resolve(opts.vercel)), { recursive: true });
    writeFileSync(opts.vercel, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    files.push(opts.vercel);
  }
  if (opts.public) {
    mkdirSync(opts.public, { recursive: true });
    const file = join(opts.public, '_redirects');
    writeFileSync(file, toCloudflareRedirects(plan.redirects), 'utf8');
    files.push(file);
  }
  return { plan, files };
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
  if (!opts.inventory || !opts.mapping || !opts.out) {
    console.error('Error: se requieren <inventory.json> <mapping.json> y --out <dir>\n');
    console.error(HELP);
    process.exit(1);
  }
  let result;
  try {
    result = runPlan(opts);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  const { plan, files } = result;
  if (opts.json) {
    console.log(JSON.stringify({ ...plan, files }, null, 2));
  } else {
    console.log(
      `Plan: ${plan.redirects.length} redirects · ${plan.unchanged.length} sin cambios · ${plan.conflicts.length} conflictos · ${plan.missing.length} sin mapping`,
    );
    for (const r of plan.redirects) console.log(`  ${r.status} ${r.from} → ${r.to ?? '(eliminada)'}  [${r.reason}]`);
    for (const f of files) console.log(`  escrito: ${f}`);
  }
  let failed = false;
  if (plan.conflicts.length) {
    failed = true;
    console.error(`\nConflictos (${plan.conflicts.length}): varios orígenes apuntan al mismo destino sin "reason" en mapping.json:`);
    for (const c of plan.conflicts) console.error(`  → ${c.to}  desde: ${c.froms.join(', ')}`);
    console.error('  Solución: usa { "to": "/destino/", "reason": "fusionadas" } en cada origen si la fusión es intencional.');
  }
  if (plan.missing.length) {
    failed = true;
    console.error(`\nPáginas sin mapping (${plan.missing.length}): añade cada ruta a mapping.json (destino, null o --keep):`);
    for (const p of plan.missing) console.error(`  ${p}`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
