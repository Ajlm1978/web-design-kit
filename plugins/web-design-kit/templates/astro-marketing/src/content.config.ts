/**
 * Colecciones de contenido (Astro content layer).
 *
 * `blog`: un `.md` por entrada en `src/content/blog/`. El `id` de cada entrada es el nombre
 * del archivo sin extensión y se usa como slug de la URL (`/blog/<id>/`).
 *
 * El frontmatter es compatible con lo que produce `extract-content.mjs` (migración): los
 * campos ausentes pueden venir como `null`, por eso se usa `.nullish()` en lugar de
 * `.optional()`. Los campos extra del extractor (`type`, `images`, `confidence`) se ignoran.
 *
 * Sin posts la colección está vacía: `/blog/` responde "Próximamente" con `noindex` y queda
 * fuera del sitemap (ver `astro.config.mjs`). Con posts, pon `showBlog: true` en
 * `src/config/site.ts` para que aparezca en la navegación.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod'; // `z` desde 'astro:content' está deprecado (se retira en Astro 8).

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().nullish(),
    // `null` → undefined para que falle con "fecha obligatoria" y no se convierta en 1970-01-01.
    date: z.preprocess((v) => v ?? undefined, z.coerce.date()),
    author: z.string().nullish(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    /** URL original del post en el sitio antiguo (migración). */
    sourceUrl: z.string().url().nullish(),
    /** Imagen destacada: ruta relativa a `public/` o URL absoluta (og:image y JSON-LD). */
    image: z.string().nullish(),
  }),
});

export const collections = { blog };
