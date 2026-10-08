/**
 * inventory.mjs — forma compartida de `inventory.json` (crawl-site y scan-source).
 *
 * Node >= 22, ESM, cero dependencias.
 *
 * - newInventory(source) → Inventory vacío con `source.detectedAt` (ISO).
 * - pageFromHtml({url, status, finalUrl, html, rawFile, rendered}) → Page con los metadatos del plan.
 * - rawFileName(url) → `<sha1(url)>.html`.
 * - writeInventory(dir, inv) → escribe `<dir>/inventory.json` y devuelve la ruta.
 *
 * Inventory = {version:1, source:{kind, origin, stack, detectedAt}, pages: Page[], skipped: {url, reason}[],
 *              stats:{fetched, errors, durationMs}}
 * Page = {url, status, finalUrl, title, description, canonical, h1, lang, wordCount, links[], images[],
 *         jsonld[], contentHash, rawFile, rendered}
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseHead,
  extractLinks,
  extractImages,
  mainContent,
  textOf,
  wordCount,
  contentHash,
  buildTree,
  nodeText,
} from './html.mjs';

export const INVENTORY_VERSION = 1;

/**
 * @param {{kind: 'url'|'dir'|'repo', origin: string, stack?: string|null}} source
 */
export function newInventory(source) {
  return {
    version: INVENTORY_VERSION,
    source: {
      kind: source.kind,
      origin: source.origin,
      stack: source.stack ?? null,
      detectedAt: new Date().toISOString(),
    },
    pages: [],
    skipped: [],
    stats: { fetched: 0, errors: 0, durationMs: 0 },
  };
}

/** Nombre del archivo en `raw/`: sha1 hex de la URL normalizada + `.html`. */
export function rawFileName(url) {
  return `${createHash('sha1').update(String(url), 'utf8').digest('hex')}.html`;
}

function firstH1(html) {
  const tree = buildTree(html);
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop();
    if (n.type === 'element' && n.name === 'h1') return nodeText(n) || null;
    if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return null;
}

/**
 * Construye un Page a partir del HTML. `links` se normalizan contra `finalUrl` (mismo origen).
 * `contentHash` y `wordCount` se calculan sobre el bloque de contenido principal.
 * @param {{url: string, status: number, finalUrl?: string|null, html: string, rawFile?: string|null, rendered?: boolean}} input
 */
export function pageFromHtml({ url, status, finalUrl = null, html, rawFile = null, rendered = false }) {
  const base = finalUrl ?? url;
  const src = String(html ?? '');
  const head = parseHead(src);
  const main = mainContent(src);
  const text = textOf(main.html);
  return {
    url,
    status,
    finalUrl: finalUrl ?? url,
    title: head.title,
    description: head.description,
    canonical: head.canonical,
    h1: firstH1(src),
    lang: head.lang,
    wordCount: wordCount(text),
    links: extractLinks(src, base),
    images: extractImages(src, base),
    jsonld: head.jsonld,
    contentHash: contentHash(text),
    rawFile,
    rendered: Boolean(rendered),
  };
}

/**
 * @param {string} dir
 * @param {object} inv
 * @returns {string} ruta de inventory.json
 */
export function writeInventory(dir, inv) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'inventory.json');
  writeFileSync(file, `${JSON.stringify(inv, null, 2)}\n`, 'utf8');
  return file;
}
