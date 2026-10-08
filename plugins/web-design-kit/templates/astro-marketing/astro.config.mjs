// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/config/site.ts';

/**
 * Configuración de Astro (salida estática, sin adaptador).
 *
 * Fuentes: se usa la Fonts API nativa de Astro (>= 6) con el proveedor `local`,
 * apuntando a los .woff2 de los paquetes `@fontsource-variable/*` instalados vía npm.
 * Así el build NO necesita red (ni Google Fonts ni CDN): Astro copia los archivos a
 * `_astro/fonts/`, genera `@font-face` con `font-display: swap` y calcula una fuente
 * de respaldo con `size-adjust`/`ascent-override` para evitar CLS.
 * Verificado en este sandbox el 2026-10-07: build offline OK.
 */
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore', // el host redirige (Cloudflare auto-trailing-slash, Vercel trailingSlash:true); los enlaces internos llevan barra final,
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
  image: {
    // Permite <Image> con fuentes remotas solo si se listan aquí (ninguna por defecto).
    remotePatterns: [],
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Fraunces Variable',
      cssVariable: '--font-fraunces',
      fallbacks: ['Georgia', 'Times New Roman', 'serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2'],
            weight: '100 900',
            style: 'normal',
            display: 'swap',
          },
          {
            src: ['@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2'],
            weight: '100 900',
            style: 'italic',
            display: 'swap',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Inter Variable',
      cssVariable: '--font-inter',
      fallbacks: ['system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
            display: 'swap',
          },
        ],
      },
    },
  ],
});
