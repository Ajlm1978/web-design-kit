/**
 * Constantes globales del sitio.
 *
 * REGLA: nada de datos inventados. Todo lo marcado como `PLACEHOLDER` debe
 * sustituirse con información real del cliente antes de publicar. Mientras
 * tanto, los campos de contacto se dejan vacíos o con un marcador explícito
 * para que nunca aparezca un teléfono/dirección falsos en producción.
 *
 * Este archivo se importa también desde `astro.config.mjs`, así que no debe
 * depender de módulos virtuales de Astro (`astro:*`).
 */

export const SITE = {
  /** Nombre comercial. PLACEHOLDER */
  name: 'PLACEHOLDER Nombre de la marca',
  /** Nombre corto para el logo/encabezado. PLACEHOLDER */
  shortName: 'PLACEHOLDER',
  /** URL canónica de producción, sin barra final. PLACEHOLDER */
  url: 'https://example.com',
  /** Descripción por defecto (<= 160 caracteres). PLACEHOLDER */
  description:
    'PLACEHOLDER: describe en una frase qué hace la marca y para quién.',
  /** Idioma/locale del sitio. */
  locale: 'es',
  ogLocale: 'es_ES',
  /** Imagen OG por defecto, relativa a `public/`. 1200x630 recomendado. */
  defaultOgImage: '/og-default.png', // PLACEHOLDER 1200x630. Debe ser PNG/JPG: FB/LinkedIn/X/WhatsApp no renderizan SVG
  /** Año de inicio de la actividad, para el pie de página. PLACEHOLDER */
  foundingYear: 2024,
  /**
   * Redes sociales. Dejar `null` las que no existan; el pie de página y el
   * JSON-LD `sameAs` omiten los valores nulos.
   */
  social: {
    instagram: null as string | null, // 'https://instagram.com/PLACEHOLDER'
    linkedin: null as string | null, // 'https://linkedin.com/company/PLACEHOLDER'
    youtube: null as string | null,
    x: null as string | null,
    facebook: null as string | null,
  },
  /**
   * Contacto. Vacío a propósito: `null` => el componente no renderiza el dato.
   * Nunca escribas un teléfono o email de ejemplo que parezca real.
   */
  contact: {
    email: null as string | null, // 'hola@PLACEHOLDER.com'
    phone: null as string | null, // '+1 305 000 0000' (formato E.164 para JSON-LD: '+13050000000')
    address: null as {
      streetAddress: string;
      addressLocality: string;
      addressRegion: string;
      postalCode: string;
      addressCountry: string;
    } | null,
    /** Horario en formato schema.org, ej. ['Mo-Fr 09:00-18:00'] */
    openingHours: [] as string[],
  },
  /** Navegación principal. */
  nav: [
    { label: 'Inicio', href: '/' },
    { label: 'Contacto', href: '/contacto/' },
  ],
} as const;

export type SiteConfig = typeof SITE;

/** Devuelve solo las redes con URL definida (para sameAs y el footer). */
export function socialLinks(): { name: string; href: string }[] {
  return Object.entries(SITE.social)
    .filter(([, href]) => typeof href === 'string' && href.length > 0)
    .map(([name, href]) => ({ name, href: href as string }));
}

/** Construye una URL absoluta a partir de una ruta relativa al sitio. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}
