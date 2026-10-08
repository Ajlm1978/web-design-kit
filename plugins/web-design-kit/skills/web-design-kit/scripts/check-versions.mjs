#!/usr/bin/env node
/**
 * check-versions.mjs — compara las versiones fijadas en references/versions.md
 * con la última publicada en npm (`npm view <pkg> version`).
 *
 * Node >= 22, ESM, sin dependencias.
 *
 * Uso:
 *   node scripts/check-versions.mjs                 # tabla, exit 0 siempre (informativo)
 *   node scripts/check-versions.mjs --json          # salida JSON (para otros scripts)
 *   node scripts/check-versions.mjs --strict        # exit 1 si hay drift de MAJOR
 *   node scripts/check-versions.mjs --timeout 20000 # ms por paquete (defecto 15000)
 *   node scripts/check-versions.mjs --file ruta/a/versions.md
 *
 * Qué considera "drift":
 *   MAJOR → la última en npm tiene un major distinto al fijado (aviso; con --strict falla).
 *   minor/patch → se muestra, no es aviso.
 *   Si la celda tiene varias versiones ("5.9.3 (template) / 7.0.2 (latest)") se compara
 *   contra la PRIMERA, que es la que realmente usa el template.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (flag('help') || flag('h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, ''));
  process.exit(0);
}

const JSON_OUT = flag('json');
const STRICT = flag('strict');
const TIMEOUT_MS = Number(opt('timeout', 15000));
const FILE = resolve(opt('file', resolve(__dirname, '../references/versions.md')));

// ---------- Parse versions.md ----------
/** @returns {{pkg:string, pinned:string, raw:string}[]} */
function parseTable(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const [pkgCell, versionCell] = cells;
    if (/^-+$/.test(pkgCell) || /^paquete$/i.test(pkgCell)) continue; // separador / cabecera
    // "tailwindcss / @tailwindcss/vite" o "react / react-dom" → varios paquetes, misma versión
    const pkgs = pkgCell.split('/').reduce((acc, part, i, arr) => {
      // Reconstruye scopes: "@tailwindcss" + "vite" → "@tailwindcss/vite"
      const p = part.trim();
      if (!p) return acc;
      if (p.startsWith('@') && arr[i + 1] !== undefined) {
        acc.push(`${p}/${arr[i + 1].trim()}`);
        arr[i + 1] = '';
      } else {
        acc.push(p);
      }
      return acc;
    }, []);
    const pinned = (versionCell.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/) || [])[0];
    if (!pinned) continue;
    for (const pkg of pkgs) rows.push({ pkg, pinned, raw: versionCell });
  }
  return rows;
}

// ---------- npm view, en paralelo con timeout ----------
function npmView(pkg, timeoutMs) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = execFile(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['view', pkg, 'version', '--no-update-notifier'],
      { timeout: timeoutMs, env: { ...process.env, NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        const ms = Date.now() - started;
        if (err) {
          const reason = err.killed ? `timeout tras ${timeoutMs} ms` : (stderr || err.message).trim().split('\n')[0];
          return resolvePromise({ pkg, latest: null, error: reason, ms });
        }
        resolvePromise({ pkg, latest: stdout.trim(), error: null, ms });
      },
    );
    child.on('error', (e) => resolvePromise({ pkg, latest: null, error: e.message, ms: Date.now() - started }));
  });
}

const major = (v) => Number(String(v).split('.')[0]);
const minor = (v) => Number(String(v).split('.')[1]);

function classify(pinned, latest) {
  if (!latest) return 'error';
  if (pinned === latest) return 'ok';
  if (major(latest) !== major(pinned)) return 'MAJOR';
  if (minor(latest) !== minor(pinned)) return 'minor';
  return 'patch';
}

// ---------- Main ----------
const markdown = readFileSync(FILE, 'utf8');
const rows = parseTable(markdown);
if (rows.length === 0) {
  console.error(`No se encontraron filas de paquetes en ${FILE}`);
  process.exit(2);
}

const results = await Promise.all(rows.map((r) => npmView(r.pkg, TIMEOUT_MS)));
const report = rows.map((r, i) => ({
  pkg: r.pkg,
  pinned: r.pinned,
  latest: results[i].latest,
  drift: classify(r.pinned, results[i].latest),
  error: results[i].error,
  ms: results[i].ms,
}));

const majors = report.filter((r) => r.drift === 'MAJOR');
const errors = report.filter((r) => r.drift === 'error');

if (JSON_OUT) {
  console.log(JSON.stringify({ file: FILE, checkedAt: new Date().toISOString(), majorDrift: majors.length, errors: errors.length, packages: report }, null, 2));
} else {
  const w = (s, n) => String(s).padEnd(n);
  const cols = [Math.max(7, ...report.map((r) => r.pkg.length)), 12, 12, 8];
  console.log(`Fuente: ${FILE}\n`);
  console.log(`${w('Paquete', cols[0])}  ${w('Fijada', cols[1])}  ${w('Última npm', cols[2])}  Drift`);
  console.log(`${'-'.repeat(cols[0])}  ${'-'.repeat(cols[1])}  ${'-'.repeat(cols[2])}  -----`);
  for (const r of report) {
    const tag = r.drift === 'MAJOR' ? '⚠ MAJOR' : r.drift === 'error' ? `✗ ${r.error}` : r.drift;
    console.log(`${w(r.pkg, cols[0])}  ${w(r.pinned, cols[1])}  ${w(r.latest ?? '—', cols[2])}  ${tag}`);
  }
  console.log(`\n${report.length} paquetes · ${majors.length} con drift MAJOR · ${errors.length} con error`);
  if (majors.length) {
    console.log(`\nAVISO: revisa versions.md y el template para: ${majors.map((m) => m.pkg).join(', ')}`);
  }
}

if (STRICT && majors.length > 0) process.exit(1);
process.exit(0);
