/**
 * Constructores tipados de JSON-LD (schema.org).
 *
 * Cada función devuelve un objeto plano listo para serializar con
 * `JSON.stringify` dentro de `<script type="application/ld+json">` (el
 * componente `<SEO>` lo hace por ti a través de la prop `jsonLd`).
 *
 * NO hay constructor de `FAQPage`: Google retiró los resultados enriquecidos
 * de FAQ para la mayoría de sitios en 2023 y los eliminó por completo en mayo
 * de 2026, así que marcar FAQs ya no aporta nada en búsqueda y solo añade
 * bytes. Si el cliente lo pide por otro motivo (p. ej. un buscador interno),
 * añádelo de forma consciente, no por defecto.
 *
 * Regla del kit: nunca inventes datos. Todo campo opcional que no tengas
 * (teléfono, dirección, valoraciones) se omite; no se rellena con ejemplos.
 */

import { SITE, absoluteUrl, socialLinks } from '../config/site';

const CONTEXT = 'https://schema.org' as const;

export type JsonLd = Record<string, unknown> & {
  '@context': typeof CONTEXT;
  '@type': string;
};

export interface PostalAddress {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
}

/** Elimina claves con `undefined`/`null`/arrays vacíos para no emitir ruido. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface OrganizationInput {
  name?: string;
  url?: string;
  /** Ruta o URL absoluta del logo (idealmente PNG/SVG cuadrado >= 112px). */
  logo?: string;
  description?: string;
  email?: string | null;
  telephone?: string | null;
  sameAs?: string[];
  address?: PostalAddress | null;
}

export function organization(input: OrganizationInput = {}): JsonLd {
  const url = input.url ?? SITE.url;
  return compact({
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': `${url.replace(/\/$/, '')}/#organization`,
    name: input.name ?? SITE.name,
    url,
    logo: input.logo ? absoluteUrl(input.logo) : undefined,
    description: input.description ?? SITE.description,
    email: input.email ?? SITE.contact.email ?? undefined,
    telephone: input.telephone ?? SITE.contact.phone ?? undefined,
    sameAs: input.sameAs ?? socialLinks().map((s) => s.href),
    address: toPostalAddress(input.address ?? SITE.contact.address),
  }) as JsonLd;
}

// ---------------------------------------------------------------------------
// WebSite
// ---------------------------------------------------------------------------

export interface WebSiteInput {
  name?: string;
  url?: string;
  description?: string;
  inLanguage?: string;
  /**
   * URL de búsqueda interna con `{search_term_string}`; solo si el sitio
   * tiene buscador propio.
   */
  searchUrlTemplate?: string;
}

export function website(input: WebSiteInput = {}): JsonLd {
  const url = input.url ?? SITE.url;
  return compact({
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': `${url.replace(/\/$/, '')}/#website`,
    name: input.name ?? SITE.name,
    url,
    description: input.description ?? SITE.description,
    inLanguage: input.inLanguage ?? SITE.locale,
    publisher: { '@id': `${url.replace(/\/$/, '')}/#organization` },
    potentialAction: input.searchUrlTemplate
      ? {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: input.searchUrlTemplate,
          },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  }) as JsonLd;
}

// ---------------------------------------------------------------------------
// LocalBusiness
// ---------------------------------------------------------------------------

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocalBusinessInput {
  /** Subtipo de schema.org, ej. 'Restaurant', 'Dentist', 'AutoRepair'. */
  type?: string;
  name?: string;
  url?: string;
  description?: string;
  image?: string;
  telephone?: string | null;
  email?: string | null;
  address?: PostalAddress | null;
  geo?: GeoCoordinates;
  /** Formato schema.org: ['Mo-Fr 09:00-18:00', 'Sa 10:00-14:00'] */
  openingHours?: string[];
  /** Ej. '$$' o 'EUR 20-50'. Opcional. */
  priceRange?: string;
  sameAs?: string[];
}

export function localBusiness(input: LocalBusinessInput = {}): JsonLd {
  const url = input.url ?? SITE.url;
  return compact({
    '@context': CONTEXT,
    '@type': input.type ?? 'LocalBusiness',
    '@id': `${url.replace(/\/$/, '')}/#localbusiness`,
    name: input.name ?? SITE.name,
    url,
    description: input.description ?? SITE.description,
    image: input.image ? absoluteUrl(input.image) : undefined,
    telephone: input.telephone ?? SITE.contact.phone ?? undefined,
    email: input.email ?? SITE.contact.email ?? undefined,
    address: toPostalAddress(input.address ?? SITE.contact.address),
    geo: input.geo
      ? { '@type': 'GeoCoordinates', latitude: input.geo.latitude, longitude: input.geo.longitude }
      : undefined,
    openingHours: input.openingHours ?? [...SITE.contact.openingHours],
    priceRange: input.priceRange,
    sameAs: input.sameAs ?? socialLinks().map((s) => s.href),
  }) as JsonLd;
}

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  /** Ruta relativa ('/servicios') o URL absoluta. */
  path: string;
}

export function breadcrumb(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

// ---------------------------------------------------------------------------
// Article / BlogPosting
// ---------------------------------------------------------------------------

export interface ArticleInput {
  type?: 'Article' | 'BlogPosting' | 'NewsArticle';
  headline: string;
  description?: string;
  /** Ruta de la página del artículo. */
  path: string;
  image?: string | string[];
  /** ISO 8601. */
  datePublished: string;
  dateModified?: string;
  author: { name: string; url?: string; type?: 'Person' | 'Organization' };
  inLanguage?: string;
}

export function article(input: ArticleInput): JsonLd {
  const images = Array.isArray(input.image) ? input.image : input.image ? [input.image] : [];
  return compact({
    '@context': CONTEXT,
    '@type': input.type ?? 'Article',
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: absoluteUrl(input.path),
    image: images.map(absoluteUrl),
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    inLanguage: input.inLanguage ?? SITE.locale,
    author: compact({
      '@type': input.author.type ?? 'Person',
      name: input.author.name,
      url: input.author.url,
    }),
    publisher: { '@id': `${SITE.url.replace(/\/$/, '')}/#organization` },
  }) as JsonLd;
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export interface OfferInput {
  /** Precio como string decimal, ej. '49.00'. */
  price: string;
  /** ISO 4217, ej. 'USD', 'EUR'. */
  priceCurrency: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | 'BackOrder';
  url?: string;
  /** ISO 8601 (fecha) hasta la que es válido el precio. */
  priceValidUntil?: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  brand?: string;
  offers?: OfferInput;
}

export function product(input: ProductInput): JsonLd {
  const images = Array.isArray(input.image) ? input.image : input.image ? [input.image] : [];
  return compact({
    '@context': CONTEXT,
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: images.map(absoluteUrl),
    sku: input.sku,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    offers: input.offers
      ? compact({
          '@type': 'Offer',
          price: input.offers.price,
          priceCurrency: input.offers.priceCurrency,
          availability: input.offers.availability
            ? `https://schema.org/${input.offers.availability}`
            : undefined,
          url: input.offers.url ? absoluteUrl(input.offers.url) : undefined,
          priceValidUntil: input.offers.priceValidUntil,
        })
      : undefined,
  }) as JsonLd;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPostalAddress(address: PostalAddress | null | undefined) {
  if (!address) return undefined;
  return { '@type': 'PostalAddress', ...address };
}

/**
 * Serializa de forma segura para incrustar en HTML: escapa `<` para que un
 * texto con `</script>` no rompa la página.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
