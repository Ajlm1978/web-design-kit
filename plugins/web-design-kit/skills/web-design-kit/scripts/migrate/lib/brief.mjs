/**
 * brief.mjs — brief v1 de migración: esqueleto vacío y validador mínimo (sin dependencias).
 *
 * Node >= 22, ESM. El schema de referencia (JSON Schema 2020-12, documental) vive en
 * `skills/web-design-kit/assets/brief.schema.json`; este módulo implementa las mismas reglas
 * (obligatorios, tipos, enums, confidence) para no depender de ajv.
 *
 * - emptyBrief() → brief con todos los campos a null/[] y `version: 1`.
 * - validateBrief(obj) → {ok, errors: string[]} (mensajes en español con la ruta del campo).
 */

export const BRIEF_VERSION = 1;
export const BRIEF_TYPES = ['local', 'corporativo', 'landing', 'portfolio', 'ecommerce', 'blog', 'saas'];
export const CONFIDENCES = ['high', 'medium', 'low'];
export const SOCIAL_KEYS = ['instagram', 'facebook', 'linkedin', 'x', 'youtube', 'tiktok'];
export const PAGE_TYPES = ['page', 'post'];
export const FONT_ROLES = ['display', 'body'];
export const ADDRESS_KEYS = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'];
const REQUIRED = ['version', 'name', 'type', 'language', 'locale', 'contact', 'sources'];

/** Brief vacío: nada inferido, todo `null` o `[]`. */
export function emptyBrief() {
  return {
    version: BRIEF_VERSION,
    name: null,
    type: null,
    language: null,
    locale: null,
    adjectives: [],
    pages: [],
    contact: { phone: null, email: null, address: null, openingHours: [] },
    social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, null])),
    domain: null,
    hosting: null,
    aiPolicy: null,
    brand: { logo: null, colors: [], fonts: [] },
    services: [],
    migration: { inventoryCount: 0, posts: 0, redirectsPlanned: null },
    sources: {},
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isNullableStr = (v) => v === null || isStr(v);
const isInt = (v) => Number.isInteger(v);

/**
 * Valida un brief v1. Devuelve todos los errores encontrados (no se detiene en el primero).
 * @param {unknown} obj
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateBrief(obj) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  if (!isObj(obj)) return { ok: false, errors: ['brief: debe ser un objeto'] };

  for (const k of REQUIRED) {
    if (!(k in obj) || obj[k] === undefined) err(k, 'obligatorio');
  }
  if ('version' in obj && obj.version !== BRIEF_VERSION) err('version', `debe ser ${BRIEF_VERSION}`);
  if ('name' in obj && !(isStr(obj.name) && obj.name.trim() !== '')) err('name', 'debe ser una cadena no vacía');
  if ('type' in obj && !BRIEF_TYPES.includes(obj.type)) err('type', `debe ser uno de ${BRIEF_TYPES.join('|')}`);
  if ('language' in obj && !(isStr(obj.language) && /^[a-z]{2,3}$/i.test(obj.language))) err('language', 'código ISO 639-1 (p. ej. es)');
  if ('locale' in obj && !(isStr(obj.locale) && /^[a-z]{2,3}_[A-Z]{2}$/.test(obj.locale))) err('locale', 'formato ll_CC (p. ej. es_US)');

  checkStringArray(obj.adjectives, 'adjectives', err);

  if (obj.pages !== undefined) {
    if (!Array.isArray(obj.pages)) err('pages', 'debe ser una lista');
    else {
      obj.pages.forEach((p, i) => {
        const path = `pages[${i}]`;
        if (!isObj(p)) return err(path, 'debe ser un objeto');
        if (!isStr(p.sourceUrl)) err(`${path}.sourceUrl`, 'obligatorio (cadena)');
        if (!isNullableStr(p.title)) err(`${path}.title`, 'cadena o null');
        if (!isStr(p.slug)) err(`${path}.slug`, 'obligatorio (cadena)');
        if (!PAGE_TYPES.includes(p.type)) err(`${path}.type`, `debe ser ${PAGE_TYPES.join('|')}`);
      });
    }
  }

  if ('contact' in obj) {
    const c = obj.contact;
    if (!isObj(c)) err('contact', 'debe ser un objeto');
    else {
      if (!isNullableStr(c.phone)) err('contact.phone', 'cadena o null');
      if (!isNullableStr(c.email)) err('contact.email', 'cadena o null');
      if (c.address !== null && c.address !== undefined) {
        if (!isObj(c.address)) err('contact.address', 'objeto o null');
        else {
          for (const k of ADDRESS_KEYS) {
            if (c.address[k] !== undefined && !isNullableStr(c.address[k])) err(`contact.address.${k}`, 'cadena o null');
          }
        }
      }
      checkStringArray(c.openingHours, 'contact.openingHours', err);
    }
  }

  if (obj.social !== undefined) {
    if (!isObj(obj.social)) err('social', 'debe ser un objeto');
    else {
      for (const [k, v] of Object.entries(obj.social)) {
        if (!SOCIAL_KEYS.includes(k)) err(`social.${k}`, `red desconocida (${SOCIAL_KEYS.join('|')})`);
        else if (!isNullableStr(v)) err(`social.${k}`, 'URL (cadena) o null');
      }
    }
  }

  for (const k of ['domain', 'hosting', 'aiPolicy']) {
    if (obj[k] !== undefined && !isNullableStr(obj[k])) err(k, 'cadena o null');
  }

  if (obj.brand !== undefined) {
    const b = obj.brand;
    if (!isObj(b)) err('brand', 'debe ser un objeto');
    else {
      if (!isNullableStr(b.logo)) err('brand.logo', 'cadena o null');
      if (b.colors !== undefined) {
        if (!Array.isArray(b.colors)) err('brand.colors', 'debe ser una lista');
        else {
          b.colors.forEach((c, i) => {
            const path = `brand.colors[${i}]`;
            if (!isObj(c)) return err(path, 'debe ser un objeto');
            if (!(isStr(c.hex) && /^#[0-9a-f]{6}$/.test(c.hex))) err(`${path}.hex`, 'formato #rrggbb en minúsculas');
            if (!(isStr(c.oklch) && /^oklch\(/.test(c.oklch))) err(`${path}.oklch`, 'cadena oklch(L% C H)');
            if (c.role !== undefined && !isNullableStr(c.role)) err(`${path}.role`, 'cadena o null');
          });
        }
      }
      if (b.fonts !== undefined) {
        if (!Array.isArray(b.fonts)) err('brand.fonts', 'debe ser una lista');
        else {
          b.fonts.forEach((f, i) => {
            const path = `brand.fonts[${i}]`;
            if (!isObj(f)) return err(path, 'debe ser un objeto');
            if (!isStr(f.family)) err(`${path}.family`, 'obligatorio (cadena)');
            if (!FONT_ROLES.includes(f.role)) err(`${path}.role`, `debe ser ${FONT_ROLES.join('|')}`);
            if (!isNullableStr(f.fontsource)) err(`${path}.fontsource`, 'cadena o null');
          });
        }
      }
    }
  }

  if (obj.services !== undefined) {
    if (!Array.isArray(obj.services)) err('services', 'debe ser una lista');
    else {
      obj.services.forEach((s, i) => {
        const path = `services[${i}]`;
        if (!isObj(s)) return err(path, 'debe ser un objeto');
        if (!isStr(s.title)) err(`${path}.title`, 'obligatorio (cadena)');
        if (!isNullableStr(s.summary)) err(`${path}.summary`, 'cadena o null');
        if (!isNullableStr(s.sourceUrl)) err(`${path}.sourceUrl`, 'cadena o null');
      });
    }
  }

  if (obj.migration !== undefined) {
    const m = obj.migration;
    if (!isObj(m)) err('migration', 'debe ser un objeto');
    else {
      if (!isInt(m.inventoryCount) || m.inventoryCount < 0) err('migration.inventoryCount', 'entero ≥ 0');
      if (!isInt(m.posts) || m.posts < 0) err('migration.posts', 'entero ≥ 0');
      if (m.redirectsPlanned !== null && m.redirectsPlanned !== undefined && !(isInt(m.redirectsPlanned) && m.redirectsPlanned >= 0)) {
        err('migration.redirectsPlanned', 'entero ≥ 0 o null');
      }
    }
  }

  if ('sources' in obj) {
    if (!isObj(obj.sources)) err('sources', 'debe ser un objeto {campo: {from, confidence}}');
    else {
      for (const [k, v] of Object.entries(obj.sources)) {
        const path = `sources.${k}`;
        if (!isObj(v)) {
          err(path, 'debe ser {from, confidence}');
          continue;
        }
        if (!isStr(v.from) || v.from === '') err(`${path}.from`, 'obligatorio (URL o archivo)');
        if (!CONFIDENCES.includes(v.confidence)) err(`${path}.confidence`, `debe ser ${CONFIDENCES.join('|')}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkStringArray(v, path, err) {
  if (v === undefined) return;
  if (!Array.isArray(v)) return err(path, 'debe ser una lista de cadenas');
  v.forEach((s, i) => {
    if (!isStr(s)) err(`${path}[${i}]`, 'debe ser una cadena');
  });
}
