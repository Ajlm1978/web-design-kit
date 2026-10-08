/**
 * url.mjs — normalización de URLs para el rastreo y la migración.
 *
 * Node >= 22, ESM, cero dependencias.
 *
 * - normalizeUrl(href, base): URL absoluta normalizada o null si es de otro origen / no-http.
 * - sameOrigin(a, b): esquema + host + puerto iguales.
 * - slugFromPath(path): slug estable (ASCII, minúsculas, guiones) a partir de una ruta.
 */

/** Extensiones tratadas como archivo: no se fuerza barra final. */
const FILE_EXT_RE = /\.[a-z0-9]{1,8}$/i;

/**
 * Normaliza `href` contra `base`:
 * - resuelve relativas, quita fragmento y parámetros `utm_*`,
 * - fuerza barra final en rutas sin extensión,
 * - devuelve null si el resultado no es http(s) o no comparte origen con `base`.
 * @param {string} href
 * @param {string} base URL absoluta (origen de referencia)
 * @returns {string|null}
 */
export function normalizeUrl(href, base) {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (trimmed === '') return null;
  // Esquemas no navegables: descartar antes de resolver.
  if (/^(mailto|tel|sms|javascript|data|ftp|file):/i.test(trimmed)) return null;

  let url;
  let baseUrl;
  try {
    baseUrl = new URL(base);
    url = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== baseUrl.origin) return null;

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key)) url.searchParams.delete(key);
  }
  // URL serializa `?` vacío si hubo params; limpiarlo.
  if ([...url.searchParams.keys()].length === 0) url.search = '';

  let path = url.pathname || '/';
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (!path.endsWith('/') && !FILE_EXT_RE.test(lastSegment)) path += '/';
  url.pathname = path;

  return url.toString();
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Slug estable a partir de una ruta: `/blog/post-01/` → `blog-post-01`; `/` → `index`.
 * Quita acentos, extensión de archivo y caracteres no alfanuméricos.
 * @param {string} path ruta (puede venir como URL absoluta)
 * @returns {string}
 */
export function slugFromPath(path) {
  let p = String(path ?? '');
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* se usa tal cual */
    }
  }
  try {
    p = decodeURIComponent(p);
  } catch {
    /* ruta con % inválido: se deja tal cual */
  }
  p = p.split(/[?#]/)[0];
  const segments = p.split('/').filter(Boolean);
  if (segments.length === 0) return 'index';
  const last = segments.length - 1;
  segments[last] = segments[last].replace(FILE_EXT_RE, '');
  if (segments[last] === 'index' && segments.length > 1) segments.pop();

  const slug = segments
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'index';
}
