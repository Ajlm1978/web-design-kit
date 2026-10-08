/**
 * redirects.mjs — planificación y verificación de redirects 301 entre el sitio antiguo y el nuevo.
 *
 * Node >= 22, ESM, cero dependencias. Compartido por plan-redirects.mjs y check-redirects.mjs.
 *
 * - pathOf(urlOrPath) → ruta normalizada (`/x/` con barra final si no tiene extensión).
 * - planRedirects(inventory, mapping, opts) → {redirects, unchanged, conflicts, missing, notes, warnings}.
 *     opts.pages: `brief.pages[]` (path/targetPath): un post cuyo targetPath ≠ path recibe 301 automático.
 *     opts.strict: las rutas sin mapping ni targetPath ni --keep son `missing` (por defecto se tratan como
 *     "sin cambios" y es check-redirects quien las verifica contra dist/).
 *     Claves del mapping que no están en `inventory.pages` pero sí en `inventory.skipped` (robots, redirect…)
 *     se honran igual (el redirect se emite) y dejan una entrada en `notes[]`; las que no están en ninguno
 *     generan `warnings[]` ("Clave de mapping no encontrada en el inventario: <ruta>"), no fatal.
 * - resolveChain(path, redirects, maxHops) → {to, status, hops, chain, loop}.
 * - checkRedirects(inventory, dist, redirects, opts) → {ok, checked, redirected, gone, orphans, loops, conflicts}.
 *     opts.conflicts=false omite la detección de conflictos (p. ej. cuando los redirects vienen de un vercel.json,
 *     que no guarda `reason`); el informe lo indica con `conflictsChecked: false`.
 * - mergeVercelRedirects(vercelJson, redirects) → nuevo objeto vercel.json con bloque `redirects` fusionado.
 * - toCloudflareRedirects(redirects) → texto `_redirects` (`from to 301` por línea).
 *
 * mapping.json (lo escribe el agente): `{ "/old/": "/new/" | null | {to, reason?, status?} }`.
 *   - cadena: destino; si coincide con el origen → sin redirect.
 *   - null: página descartada → 301 al padre más cercano que exista en el sitio nuevo.
 *   - objeto: `to` (ruta o null), `reason` (marca una fusión intencional), `status` (301 por defecto; 410 = eliminada).
 *
 * Conflicto: dos orígenes distintos → mismo destino y alguno de ellos sin `reason` explícito
 * (los redirects automáticos "página descartada → padre" cuentan como explícitos).
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const REASON_SLUG = 'slug cambiado';
export const REASON_PARENT = 'página descartada → padre';
export const REASON_GONE = 'página eliminada (410)';
export const MAX_HOPS = 5;

/** Razones generadas automáticamente que NO documentan una fusión intencional. */
const AUTO_REASONS = new Set([REASON_SLUG]);

const FILE_EXT_RE = /\.[a-z0-9]{1,8}$/i;

/**
 * Ruta normalizada a partir de una ruta o una URL absoluta: sin query/fragmento, barra inicial,
 * barra final si el último segmento no tiene extensión. Devuelve null si no se puede interpretar.
 * @param {string} input
 * @returns {string|null}
 */
export function pathOf(input) {
  if (input === null || input === undefined) return null;
  let p = String(input).trim();
  if (p === '') return null;
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  const last = p.slice(p.lastIndexOf('/') + 1);
  if (!p.endsWith('/') && !FILE_EXT_RE.test(last)) p += '/';
  return p;
}

/** Padre inmediato de una ruta: `/a/b/` → `/a/`, `/a/b.html` → `/a/`, `/` → null. */
export function parentOf(path) {
  if (!path || path === '/') return null;
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : `${trimmed.slice(0, idx)}/`;
}

/** Normaliza un valor de mapping a `{to, reason, status, explicit}`. */
function normalizeMappingValue(value) {
  if (value === null) return { to: null, reason: null, status: 301, discarded: true };
  if (typeof value === 'string') return { to: pathOf(value), reason: null, status: 301, discarded: false };
  if (typeof value === 'object') {
    const status = Number.isInteger(value.status) ? value.status : 301;
    const to = value.to === null || value.to === undefined ? null : pathOf(value.to);
    const reason = typeof value.reason === 'string' && value.reason.trim() !== '' ? value.reason.trim() : null;
    return { to, reason, status, discarded: to === null && status !== 410 };
  }
  throw new Error(`Valor de mapping no válido: ${JSON.stringify(value)}`);
}

/** Rutas (status < 400) del inventario, en orden y sin duplicados. */
export function inventoryPaths(inventory) {
  const seen = new Set();
  const out = [];
  for (const page of inventory?.pages ?? []) {
    if (typeof page.status === 'number' && page.status >= 400) continue;
    const p = pathOf(page.url);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * Planifica redirects a partir del inventario y del mapping del agente.
 * @param {object} inventory inventory.json
 * @param {Record<string, string|null|{to?: string|null, reason?: string, status?: number}>} mapping
 * @param {{defaultParent?: string, keep?: string[], postPattern?: RegExp, strict?: boolean,
 *          pages?: {path?: string, sourceUrl?: string, targetPath?: string}[]}} [opts]
 *   - `pages`: `brief.pages[]`; aporta el `targetPath` por defecto de cada ruta (posts fuera de /blog/ → /blog/<slug>/).
 *   - `strict`: una ruta sin mapping, sin targetPath, que no sea post ni esté en keep → `missing` (exit 1 en la CLI).
 *     Por defecto (false) esas rutas se consideran "sin cambios": `check-redirects` las verifica contra dist/.
 * @returns {{redirects: {from:string,to:string|null,status:number,reason:string}[], unchanged: string[],
 *           conflicts: {to:string, froms:string[]}[], missing: string[], notes: string[], warnings: string[]}}
 */
export function planRedirects(inventory, mapping, { defaultParent = '/', keep = [], postPattern = /^\/blog\//, strict = false, pages = [] } = {}) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('mapping debe ser un objeto { "/ruta-antigua/": "/ruta-nueva/" | null | {to, reason} }');
  }
  const root = pathOf(defaultParent) ?? '/';

  // Mapping con claves normalizadas.
  const map = new Map();
  for (const [key, value] of Object.entries(mapping)) {
    const from = pathOf(key);
    if (!from) throw new Error(`Clave de mapping no válida: ${JSON.stringify(key)}`);
    map.set(from, normalizeMappingValue(value));
  }
  const keepSet = new Set(keep.map(pathOf).filter(Boolean));
  const paths = inventoryPaths(inventory);

  // targetPath por defecto según el brief (path → targetPath).
  const targets = new Map();
  for (const pg of Array.isArray(pages) ? pages : []) {
    const from = pathOf(pg?.path ?? pg?.sourceUrl);
    const to = pathOf(pg?.targetPath);
    if (from && to) targets.set(from, to);
  }

  // Destinos que existirán en el sitio nuevo: valores del mapping + keep + targetPath del brief + rutas sin
  // cambios (todo lo no mapeado, posts incluidos) + raíz.
  const destinations = new Set([root]);
  for (const v of map.values()) if (v.to) destinations.add(v.to);
  for (const k of keepSet) destinations.add(k);
  for (const p of paths) {
    if (map.has(p)) continue;
    if (targets.has(p)) destinations.add(targets.get(p));
    else if (!strict || (postPattern && postPattern.test(p))) destinations.add(p);
  }

  const redirects = [];
  const unchanged = [];
  const missing = [];
  const notes = [];
  const warnings = [];
  /** @type {Map<string, {from:string, explicit:boolean}[]>} */
  const byTarget = new Map();

  const addRedirect = (entry, explicit) => {
    redirects.push(entry);
    if (entry.to) {
      if (!byTarget.has(entry.to)) byTarget.set(entry.to, []);
      byTarget.get(entry.to).push({ from: entry.from, explicit });
    }
  };

  /** Aplica una entrada del mapping a una ruta antigua. */
  const applyMapping = (from, m) => {
    if (m.status === 410) {
      addRedirect({ from, to: null, status: 410, reason: m.reason ?? REASON_GONE }, true);
      return;
    }
    if (m.discarded) {
      let parent = parentOf(from);
      while (parent && parent !== root && !destinations.has(parent)) parent = parentOf(parent);
      const to = parent && destinations.has(parent) ? parent : root;
      addRedirect({ from, to, status: 301, reason: m.reason ?? REASON_PARENT }, true);
      return;
    }
    if (m.to === from) {
      unchanged.push(from);
      return;
    }
    addRedirect({ from, to: m.to, status: m.status, reason: m.reason ?? REASON_SLUG }, m.reason !== null);
  };

  const pathSet = new Set(paths);
  for (const from of paths) {
    const m = map.get(from);
    if (!m) {
      const target = targets.get(from);
      if (target && target !== from) {
        addRedirect({ from, to: target, status: 301, reason: REASON_SLUG }, true);
      } else if (target || keepSet.has(from) || !strict || (postPattern && postPattern.test(from))) {
        unchanged.push(from);
      } else {
        missing.push(from);
      }
      continue;
    }
    applyMapping(from, m);
  }

  // Claves del mapping fuera de inventory.pages: en skipped (robots, redirect…) se honran con nota;
  // en ninguna parte → aviso (no fatal): probablemente una ruta mal escrita o un sitio distinto.
  const skippedByPath = new Map();
  for (const s of inventory?.skipped ?? []) {
    const p = pathOf(s.url);
    if (p && !skippedByPath.has(p)) skippedByPath.set(p, s);
  }
  for (const [from, m] of map) {
    if (pathSet.has(from)) continue;
    const sk = skippedByPath.get(from);
    if (sk) {
      applyMapping(from, m);
      notes.push(`${from}: no está en inventory.pages (skipped: ${sk.reason ?? 'sin motivo'}); se aplica el mapping igualmente`);
    } else {
      warnings.push(`Clave de mapping no encontrada en el inventario: ${from}`);
    }
  }

  const conflicts = [];
  for (const [to, entries] of byTarget) {
    const froms = [...new Set(entries.map((e) => e.from))];
    if (froms.length >= 2 && entries.some((e) => !e.explicit)) conflicts.push({ to, froms });
  }

  return { redirects, unchanged, conflicts, missing, notes, warnings };
}

/**
 * Sigue la cadena de redirects desde `path`.
 * @returns {{to: string|null, status: number|null, hops: number, chain: string[], loop: boolean}}
 *   `status` 410 indica destino eliminado (terminal); `loop` true si hay ciclo o más de `maxHops` saltos.
 */
export function resolveChain(path, redirects, maxHops = MAX_HOPS) {
  const index = new Map();
  for (const r of redirects ?? []) {
    const from = pathOf(r.from);
    if (from && !index.has(from)) index.set(from, r);
  }
  let current = pathOf(path);
  const chain = [current];
  let status = null;
  let hops = 0;
  while (index.has(current)) {
    const r = index.get(current);
    status = r.status ?? 301;
    if (status === 410) return { to: null, status: 410, hops: hops + 1, chain, loop: false };
    const next = pathOf(r.to);
    if (!next) return { to: null, status, hops: hops + 1, chain, loop: false };
    hops++;
    if (chain.includes(next) || hops > maxHops) return { to: next, status, hops, chain: [...chain, next], loop: true };
    chain.push(next);
    current = next;
  }
  return { to: current, status, hops, chain, loop: false };
}

/**
 * ¿Existe en `dist` un archivo que sirva `path`? Acepta `<path>/index.html`, `<path>` con extensión,
 * `<path>.html` y `<path-sin-barra>.html`.
 */
export function distHasPath(dist, path) {
  const p = pathOf(path);
  if (!p) return false;
  const segments = p.split('/').filter(Boolean);
  const candidates = [];
  if (p.endsWith('/')) {
    candidates.push(join(dist, ...segments, 'index.html'));
    if (segments.length) candidates.push(join(dist, ...segments.slice(0, -1), `${segments[segments.length - 1]}.html`));
  } else {
    candidates.push(join(dist, ...segments));
    candidates.push(join(dist, ...segments.slice(0, -1), `${segments[segments.length - 1]}.html`));
  }
  return candidates.some((f) => {
    try {
      return existsSync(f) && statSync(f).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Verifica paridad: cada URL antigua (status < 400) debe terminar, tras seguir los redirects, en un
 * archivo de `dist` o en un 410 explícito.
 * @param {object} inventory
 * @param {string} dist carpeta construida
 * @param {{from:string,to:string|null,status?:number,reason?:string}[]} redirects
 * @param {{maxHops?: number}} [opts]
 */
export function checkRedirects(inventory, dist, redirects = [], { maxHops = MAX_HOPS, conflicts: checkConflicts = true } = {}) {
  const list = Array.isArray(redirects) ? redirects : [];
  const paths = inventoryPaths(inventory);
  const orphans = [];
  const loops = [];
  let redirected = 0;
  let gone = 0;
  /** destino final → [{from, explicit}] solo para rutas que pasaron por ≥1 redirect */
  const byTarget = new Map();

  const reasonIndex = new Map();
  for (const r of list) {
    const from = pathOf(r.from);
    if (from && !reasonIndex.has(from)) reasonIndex.set(from, r);
  }

  for (const from of paths) {
    const res = resolveChain(from, list, maxHops);
    if (res.loop) {
      loops.push({ from, chain: res.chain });
      continue;
    }
    if (res.status === 410) {
      gone++;
      continue;
    }
    if (res.hops > 0) {
      redirected++;
      // El redirect que da la razón es el primero de la cadena (el que escribió el agente para `from`).
      const first = reasonIndex.get(from);
      const reason = typeof first?.reason === 'string' ? first.reason.trim() : '';
      const explicit = reason !== '' && !AUTO_REASONS.has(reason);
      if (!byTarget.has(res.to)) byTarget.set(res.to, []);
      byTarget.get(res.to).push({ from, explicit });
    }
    if (!res.to || !distHasPath(dist, res.to)) orphans.push({ from, resolvedTo: res.to, hops: res.hops });
  }

  const conflicts = [];
  if (checkConflicts) {
    for (const [to, entries] of byTarget) {
      const froms = [...new Set(entries.map((e) => e.from))];
      if (froms.length >= 2 && entries.some((e) => !e.explicit)) conflicts.push({ to, froms });
    }
  }

  return {
    ok: orphans.length === 0 && loops.length === 0 && conflicts.length === 0,
    checked: paths.length,
    redirected,
    gone,
    orphans,
    loops,
    conflicts,
    conflictsChecked: Boolean(checkConflicts),
  };
}

/**
 * Fusiona nuestros redirects en un `vercel.json` sin tocar `headers`, `trailingSlash` ni otras claves.
 * Deduplica por `source` (los nuestros reemplazan a los existentes). Los 410 se omiten (Vercel no los soporta
 * como redirect). Devuelve un objeto nuevo.
 */
export function mergeVercelRedirects(vercelJson, redirects) {
  const base = vercelJson && typeof vercelJson === 'object' && !Array.isArray(vercelJson) ? vercelJson : {};
  const out = { ...base };
  const existing = Array.isArray(base.redirects) ? base.redirects : [];
  const bySource = new Map();
  for (const r of existing) if (r && typeof r.source === 'string') bySource.set(r.source, { ...r });
  for (const r of redirects ?? []) {
    if (!r || r.status === 410 || !r.to) continue;
    const source = pathOf(r.from);
    if (!source) continue;
    const permanent = r.status === 301 || r.status === 308 || r.status === undefined;
    bySource.set(source, { source, destination: pathOf(r.to), permanent });
  }
  out.redirects = [...bySource.values()];
  return out;
}

/**
 * Formato `_redirects` (Cloudflare Pages / Netlify): `from to status` por línea. Los 410 se omiten
 * con un comentario, porque Cloudflare no los soporta en este archivo.
 */
export function toCloudflareRedirects(redirects) {
  const lines = ['# Generado por web-design-kit plan-redirects.mjs'];
  for (const r of redirects ?? []) {
    const from = pathOf(r.from);
    if (!from) continue;
    if (r.status === 410 || !r.to) {
      lines.push(`# ${from} → 410 (eliminada): gestionar en el servidor/edge, no soportado en _redirects`);
      continue;
    }
    lines.push(`${from} ${pathOf(r.to)} ${r.status ?? 301}`);
  }
  return `${lines.join('\n')}\n`;
}
