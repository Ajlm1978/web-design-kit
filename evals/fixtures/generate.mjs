#!/usr/bin/env node
/**
 * generate.mjs — genera los fixtures de migración de forma determinista.
 *
 * Uso:  node evals/fixtures/generate.mjs
 *
 * Escribe:
 *   evals/fixtures/wp-like/      sitio estático con estructura WordPress:
 *                                12 páginas + 30 posts (/blog/post-NN/), sitemap.xml, robots.txt,
 *                                style.css, logo.svg, 3 enlaces rotos, 1 página duplicada,
 *                                JSON-LD LocalBusiness en /contacto/, theme-color, 1 enlace externo.
 *   evals/fixtures/wp-export.xml WXR 1.2 con 5 items (3 publish, 1 draft, 1 private).
 *   evals/fixtures/spa-like/     index.html con <div id="root"> vacío + app.js que inyecta contenido.
 *
 * Determinista: sin Date.now ni aleatoriedad; todas las fechas son fijas en 2024.
 * Node >= 22, ESM, cero dependencias. Datos ficticios: "Taller Demo" es un PLACEHOLDER.
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://localhost';
const SITE_NAME = 'Taller Demo';
const THEME_COLOR = '#0f766e';
const ACCENT = '#f59e0b';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Párrafos deterministas a partir de una semilla textual. */
const SENTENCES = [
  'Llevamos más de veinte años reparando vehículos en Miami con honestidad y precios claros.',
  'Nuestro equipo certificado trabaja con herramientas de diagnóstico de última generación.',
  'Atendemos tanto a particulares como a flotas comerciales de toda la ciudad.',
  'Cada reparación incluye una revisión gratuita de niveles y presión de neumáticos.',
  'Ofrecemos presupuesto por escrito antes de empezar cualquier trabajo.',
  'La garantía cubre piezas y mano de obra durante doce meses.',
  'Puedes esperar en nuestra sala con café y conexión Wi-Fi mientras trabajamos.',
  'Si la avería es grave, te ayudamos a gestionar el remolque hasta el taller.',
];

function paragraph(seed, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(SENTENCES[(seed + i * 3) % SENTENCES.length]);
  return out.join(' ');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Layout común (WordPress-like)
// ---------------------------------------------------------------------------

const NAV = [
  ['/', 'Inicio'],
  ['/servicios/', 'Servicios'],
  ['/nosotros/', 'Nosotros'],
  ['/precios/', 'Precios'],
  ['/blog/', 'Blog'],
  ['/contacto/', 'Contacto'],
];

function layout({ path, title, description, body, extraHead = '', bodyClass = 'page' }) {
  const canonical = ORIGIN + path;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${SITE_NAME}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="${THEME_COLOR}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:image" content="${ORIGIN}/wp-content/uploads/2024/01/og-default.jpg">
<link rel="stylesheet" href="/style.css">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} &raquo; Feed" href="/feed/">
${extraHead}</head>
<body class="${bodyClass}">
<header class="site-header">
  <a class="site-logo" href="/"><img src="/logo.svg" alt="${SITE_NAME} logo" width="160" height="40"></a>
  <nav class="main-navigation" aria-label="Principal">
    <ul>
${NAV.map(([href, label]) => `      <li><a href="${href}">${label}</a></li>`).join('\n')}
    </ul>
  </nav>
</header>
${body}
<footer class="site-footer">
  <div class="footer-widgets">
    <div class="widget widget_text"><p>${SITE_NAME} &middot; 1234 NW 7th St, Miami, FL 33125 &middot; <a href="tel:+13055550123">+1 305 555 0123</a></p></div>
    <div class="widget widget_nav_menu"><ul><li><a href="/legal/">Aviso legal</a></li><li><a href="/faq/">Preguntas frecuentes</a></li><li><a href="/galeria/">Galer&iacute;a</a></li><li><a href="/equipo/">Equipo</a></li></ul></div>
  </div>
  <p class="copyright">&copy; 2024 ${SITE_NAME}. Todos los derechos reservados.</p>
</footer>
<div class="cookie-notice"><p>Usamos cookies para mejorar tu experiencia. <a href="/legal/">M&aacute;s info</a></p></div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

const AUTHORS = ['Ana Pérez', 'Luis Gómez', 'María Ruiz'];
const TAGS = ['mantenimiento', 'frenos', 'aceite', 'neumaticos', 'diagnostico', 'electrico'];
const POST_TOPICS = [
  'Cómo saber cuándo cambiar el aceite',
  'Señales de que tus frenos necesitan revisión',
  'Presión correcta de los neumáticos en verano',
  'Qué significa la luz del motor',
  'Mantenimiento preventivo para flotas',
  'Batería descargada: causas frecuentes',
];

function postMeta(n) {
  const month = ((n - 1) % 12) + 1;
  const day = ((n * 7) % 27) + 1;
  const date = `2024-${pad2(month)}-${pad2(day)}`;
  const imageCount = ((n - 1) % 3) + 1; // 1–3
  const images = [];
  for (let i = 1; i <= imageCount; i++) {
    images.push({
      src: `/wp-content/uploads/2024/${pad2(month)}/post-${pad2(n)}-img-${i}.jpg`,
      alt: `Imagen ${i} del artículo ${n}`,
      width: 800 + i * 100,
      height: 600,
    });
  }
  return {
    n,
    slug: `post-${pad2(n)}`,
    path: `/blog/post-${pad2(n)}/`,
    title: `${POST_TOPICS[(n - 1) % POST_TOPICS.length]} (${n})`,
    date,
    author: AUTHORS[(n - 1) % AUTHORS.length],
    tags: [TAGS[(n - 1) % TAGS.length], TAGS[(n + 2) % TAGS.length]],
    images,
  };
}

const POSTS = Array.from({ length: 30 }, (_, i) => postMeta(i + 1));

function postPage(post) {
  const prev = POSTS[post.n - 2];
  const next = POSTS[post.n];
  const figures = post.images
    .map(
      (img) =>
        `<figure class="wp-block-image"><img src="${img.src}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}"><figcaption>${esc(img.alt)}</figcaption></figure>`,
    )
    .join('\n');
  const body = `<main id="primary" class="site-main">
<article id="post-${100 + post.n}" class="post type-post">
  <header class="entry-header">
    <h1 class="entry-title">${esc(post.title)}</h1>
    <div class="entry-meta">
      <span class="posted-on">Publicado el <time datetime="${post.date}T09:00:00-05:00">${post.date}</time></span>
      <span class="byline">por <a class="url fn n" href="/author/${post.author.split(' ')[0].toLowerCase()}/" rel="author">${esc(post.author)}</a></span>
    </div>
  </header>
  <div class="entry-content">
    <p>${paragraph(post.n, 2)}</p>
    ${figures}
    <h2>Qué revisamos</h2>
    <ul>
      <li>Nivel y estado del aceite</li>
      <li>Desgaste de pastillas y discos</li>
      <li>Presión y dibujo de los neumáticos</li>
    </ul>
    <p>${paragraph(post.n + 5, 2)} Lee también nuestra página de <a href="/servicios/">servicios</a>.</p>
    <blockquote><p>Un mantenimiento a tiempo evita el 80% de las averías graves.</p></blockquote>
  </div>
  <footer class="entry-footer">
    <span class="tags-links">Etiquetas: ${post.tags.map((t) => `<a href="/tag/${t}/" rel="tag">${t}</a>`).join(', ')}</span>
  </footer>
</article>
<nav class="post-navigation">
  ${prev ? `<a href="${prev.path}" rel="prev">&larr; ${esc(prev.title)}</a>` : ''}
  ${next ? `<a href="${next.path}" rel="next">${esc(next.title)} &rarr;</a>` : ''}
</nav>
<div id="comments" class="comments-area"><h2>Comentarios</h2><p>No hay comentarios.</p></div>
<aside class="widget-area sidebar"><h2>Entradas recientes</h2><ul>${POSTS.slice(0, 3).map((p) => `<li><a href="${p.path}">${esc(p.title)}</a></li>`).join('')}</ul></aside>
</main>`;
  const extraHead = `<meta property="article:published_time" content="${post.date}T09:00:00-05:00">
<meta name="author" content="${esc(post.author)}">
`;
  return layout({
    path: post.path,
    title: post.title,
    description: `${post.title}: consejos del equipo de ${SITE_NAME}.`,
    body,
    extraHead,
    bodyClass: 'post-template-default single single-post',
  });
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

const ABOUT_BODY = `<h1>Sobre nosotros</h1>
    <p>${paragraph(1, 3)}</p>
    <h2>Nuestra historia</h2>
    <p>${paragraph(4, 3)}</p>
    <p>Visita también la <a href="/galeria/">galer&iacute;a</a> y conoce al <a href="/equipo/">equipo</a>.</p>`;

const PAGES = [
  {
    path: '/',
    title: 'Taller mecánico en Miami',
    description: 'Taller Demo: reparación y mantenimiento de vehículos en Miami con garantía de 12 meses.',
    main: `<h1>Tu taller de confianza en Miami</h1>
    <p>${paragraph(0, 2)}</p>
    <section class="services-grid">
      <h2>Servicios destacados</h2>
      <div class="card"><h3>Cambio de aceite</h3><p>Desde $39.</p><a href="/servicios/">Ver más</a></div>
      <div class="card"><h3>Frenos</h3><p>Pastillas y discos.</p><a href="/servicios/">Ver más</a></div>
      <div class="card"><h3>Diagnóstico</h3><p>Lectura de códigos.</p><a href="/servicios/">Ver más</a></div>
    </section>
    <p>Consulta nuestros <a href="/precios/">precios</a> o lee el <a href="/blog/">blog</a>. Somos miembros de <a href="https://example.org/" rel="nofollow">la asociación de talleres</a>.</p>
    <p>Enlace antiguo a una <a href="/no-existe-1/">promoción caducada</a>.</p>`,
  },
  {
    path: '/servicios/',
    title: 'Servicios',
    description: 'Mantenimiento, frenos, diagnóstico electrónico y más.',
    main: `<h1>Servicios</h1>
    <p>${paragraph(2, 2)}</p>
    <h2>Mantenimiento preventivo</h2>
    <p>Cambio de aceite, filtros y revisión de niveles.</p>
    <h2>Frenos</h2>
    <p>Sustitución de pastillas, discos y purgado del circuito.</p>
    <h2>Diagnóstico electrónico</h2>
    <p>Lectura y borrado de códigos de avería.</p>
    <h2>Neumáticos</h2>
    <p>Montaje, equilibrado y alineación.</p>
    <p>Ver <a href="/precios/">precios</a> o <a href="/contacto/">pedir cita</a>. Antiguo catálogo: <a href="/no-existe-2/">descargar PDF</a>.</p>`,
  },
  {
    path: '/nosotros/',
    title: 'Nosotros',
    description: 'Más de veinte años cuidando los vehículos de Miami.',
    main: ABOUT_BODY,
  },
  {
    path: '/duplicada/',
    title: 'Nosotros (copia)',
    description: 'Página duplicada de Nosotros, típica de WordPress.',
    main: ABOUT_BODY,
  },
  {
    path: '/contacto/',
    title: 'Contacto',
    description: 'Dirección, teléfono y horario de Taller Demo en Miami.',
    extraHead: `<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE_NAME,
    url: ORIGIN + '/',
    telephone: '+13055550123',
    email: 'hola@taller-demo.example',
    image: ORIGIN + '/wp-content/uploads/2024/01/og-default.jpg',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '1234 NW 7th St',
      addressLocality: 'Miami',
      addressRegion: 'FL',
      postalCode: '33125',
      addressCountry: 'US',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
    ],
  },
  null,
  2,
)}
</script>
`,
    main: `<h1>Contacto</h1>
    <p>Estamos en el corazón de Miami. Escríbenos o llámanos.</p>
    <address>1234 NW 7th St, Miami, FL 33125<br>Tel: <a href="tel:+13055550123">+1 305 555 0123</a><br>Email: <a href="mailto:hola@taller-demo.example">hola@taller-demo.example</a></address>
    <h2>Horario</h2>
    <p>Lunes a viernes de 9:00 a 17:00.</p>
    <form class="wpcf7-form" action="/contacto/#wpcf7" method="post">
      <label>Nombre <input type="text" name="your-name"></label>
      <label>Mensaje <textarea name="your-message"></textarea></label>
      <button type="submit">Enviar</button>
    </form>`,
  },
  {
    path: '/blog/',
    title: 'Blog',
    description: 'Consejos de mantenimiento y novedades del taller.',
    main: `<h1>Blog</h1>
    <p>Artículos del equipo sobre mantenimiento y reparación.</p>
    <ul class="post-list">
${POSTS.map((p) => `      <li><a href="${p.path}">${esc(p.title)}</a> <time datetime="${p.date}">${p.date}</time></li>`).join('\n')}
    </ul>`,
  },
  {
    path: '/privado/',
    title: 'Área privada',
    description: 'Contenido interno no indexable.',
    extraHead: '<meta name="robots" content="noindex, nofollow">\n',
    main: `<h1>Área privada</h1>
    <p>Documentación interna del equipo. No debería rastrearse.</p>`,
  },
  {
    path: '/precios/',
    title: 'Precios',
    description: 'Tarifas orientativas de nuestros servicios.',
    main: `<h1>Precios</h1>
    <p>Precios orientativos; el presupuesto final se entrega por escrito.</p>
    <table>
      <thead><tr><th>Servicio</th><th>Precio</th></tr></thead>
      <tbody>
        <tr><td>Cambio de aceite</td><td>$39</td></tr>
        <tr><td>Pastillas de freno (eje)</td><td>$120</td></tr>
        <tr><td>Diagnóstico</td><td>$60</td></tr>
      </tbody>
    </table>
    <p>Más detalle en <a href="/servicios/">servicios</a>.</p>`,
  },
  {
    path: '/faq/',
    title: 'Preguntas frecuentes',
    description: 'Respuestas a las dudas más habituales de nuestros clientes.',
    main: `<h1>Preguntas frecuentes</h1>
    <h2>¿Necesito cita previa?</h2>
    <p>Recomendable, pero atendemos sin cita cuando hay hueco.</p>
    <h2>¿Qué garantía tienen las reparaciones?</h2>
    <p>Doce meses en piezas y mano de obra.</p>
    <h2>¿Trabajan con aseguradoras?</h2>
    <p>Sí, con las principales. Consulta el <a href="/no-existe-3/">listado de aseguradoras</a>.</p>`,
  },
  {
    path: '/galeria/',
    title: 'Galería',
    description: 'Fotos del taller y de trabajos realizados.',
    noMain: true,
    main: `<h1>Galería</h1>
    <p>${paragraph(3, 3)}</p>
    <p>Una muestra de los trabajos que realizamos cada semana en el taller.</p>
    <div class="gallery">
      <img src="/wp-content/uploads/2024/02/galeria-1.jpg" alt="Elevador con vehículo" width="600" height="400">
      <img src="/wp-content/uploads/2024/02/galeria-2.jpg" alt="Banco de diagnóstico" width="600" height="400">
      <img src="/wp-content/uploads/2024/02/galeria-3.jpg" alt="Sala de espera" width="600" height="400">
    </div>`,
  },
  {
    path: '/equipo/',
    title: 'Equipo',
    description: 'Conoce a los mecánicos de Taller Demo.',
    main: `<h1>Equipo</h1>
    <p>${paragraph(6, 2)}</p>
    <div class="team">
      <div class="member"><img src="/wp-content/uploads/2024/03/ana.jpg" alt="Ana Pérez" width="300" height="300"><h3>Ana Pérez</h3><p>Jefa de taller.</p></div>
      <div class="member"><img src="/wp-content/uploads/2024/03/luis.jpg" alt="Luis Gómez" width="300" height="300"><h3>Luis Gómez</h3><p>Electromecánico.</p></div>
      <div class="member"><img src="/wp-content/uploads/2024/03/maria.jpg" alt="María Ruiz" width="300" height="300"><h3>María Ruiz</h3><p>Atención al cliente.</p></div>
    </div>`,
  },
  {
    path: '/legal/',
    title: 'Aviso legal',
    description: 'Aviso legal y política de privacidad de Taller Demo.',
    noMain: true,
    main: `<h1>Aviso legal</h1>
    <p>${paragraph(7, 3)}</p>
    <h2>Titular</h2>
    <p>PLACEHOLDER Taller Demo LLC, 1234 NW 7th St, Miami, FL 33125.</p>
    <h2>Privacidad</h2>
    <p>${paragraph(2, 3)}</p>`,
  },
];

function pageHtml(page) {
  const inner = page.main;
  const body = page.noMain
    ? `<div class="content">\n    ${inner}\n</div>`
    : `<main id="primary" class="site-main">\n  <article class="page type-page">\n    ${inner}\n  </article>\n</main>`;
  return layout({
    path: page.path,
    title: page.title,
    description: page.description,
    body,
    extraHead: page.extraHead ?? '',
    bodyClass: page.path === '/' ? 'home page' : 'page-template-default page',
  });
}

// ---------------------------------------------------------------------------
// Generación wp-like
// ---------------------------------------------------------------------------

function generateWpLike(root) {
  rmSync(root, { recursive: true, force: true });

  for (const page of PAGES) {
    write(join(root, page.path, 'index.html'), pageHtml(page));
  }
  for (const post of POSTS) {
    write(join(root, post.path, 'index.html'), postPage(post));
  }

  const urls = [...PAGES.filter((p) => p.path !== '/privado/').map((p) => p.path), ...POSTS.map((p) => p.path)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>2024-06-15</lastmod></url>`).join('\n')}
</urlset>
`;
  write(join(root, 'sitemap.xml'), sitemap);

  write(join(root, 'robots.txt'), 'User-agent: *\nDisallow: /privado/\nSitemap: http://localhost/sitemap.xml\n');

  write(
    join(root, 'style.css'),
    `/* Tema WordPress-like de PLACEHOLDER Taller Demo */
:root { --brand: ${THEME_COLOR}; --accent: ${ACCENT}; }
body { font-family: Inter, sans-serif; color: #1f2937; background: #ffffff; margin: 0; }
h1 { font-family: "Playfair Display", serif; color: ${THEME_COLOR}; }
h2, h3 { font-family: "Playfair Display", serif; color: #111827; }
a { color: ${THEME_COLOR}; }
a:hover { color: ${ACCENT}; }
.site-header { background: ${THEME_COLOR}; color: #ffffff; padding: 1rem; }
.main-navigation a { color: #ffffff; }
.main-navigation a:hover { color: ${ACCENT}; }
.card { border: 1px solid #e5e7eb; border-top: 4px solid ${ACCENT}; padding: 1rem; }
.card a { background: ${THEME_COLOR}; color: #ffffff; padding: .5rem 1rem; }
button { background: ${ACCENT}; color: #111827; border: 0; }
.site-footer { background: #111827; color: #9ca3af; border-top: 3px solid ${THEME_COLOR}; }
.cookie-notice { background: ${ACCENT}; position: fixed; bottom: 0; }
blockquote { border-left: 4px solid ${THEME_COLOR}; color: #4b5563; }
table th { background: ${THEME_COLOR}; color: #ffffff; }
`,
  );

  write(
    join(root, 'logo.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40" viewBox="0 0 160 40"><rect width="160" height="40" rx="6" fill="${THEME_COLOR}"/><text x="12" y="27" font-family="sans-serif" font-size="18" fill="#fff">Taller Demo</text></svg>\n`,
  );
}

// ---------------------------------------------------------------------------
// WXR (WordPress eXtended RSS 1.2)
// ---------------------------------------------------------------------------

function generateWxr(file) {
  const items = [
    { id: 1, title: 'Primer artículo publicado', slug: 'primer-articulo', status: 'publish', date: '2024-01-10', type: 'post' },
    { id: 2, title: 'Segundo artículo publicado', slug: 'segundo-articulo', status: 'publish', date: '2024-02-14', type: 'post' },
    { id: 3, title: 'Tercer artículo publicado', slug: 'tercer-articulo', status: 'publish', date: '2024-03-20', type: 'post' },
    { id: 4, title: 'Borrador sin terminar', slug: 'borrador', status: 'draft', date: '2024-04-01', type: 'post' },
    { id: 5, title: 'Nota privada del equipo', slug: 'nota-privada', status: 'private', date: '2024-05-05', type: 'post' },
  ];
  const itemXml = items
    .map(
      (it) => `  <item>
    <title><![CDATA[${it.title}]]></title>
    <link>https://taller-demo.example/blog/${it.slug}/</link>
    <pubDate>${new Date(it.date + 'T09:00:00Z').toUTCString()}</pubDate>
    <dc:creator><![CDATA[ana]]></dc:creator>
    <guid isPermaLink="false">https://taller-demo.example/?p=${it.id}</guid>
    <description></description>
    <content:encoded><![CDATA[<h2>Introducción</h2>
<p>${paragraph(it.id, 2)}</p>
<ul>
<li>Punto uno</li>
<li>Punto dos</li>
</ul>
<p><img src="https://taller-demo.example/wp-content/uploads/2024/0${it.id}/foto-${it.id}.jpg" alt="Foto ${it.id}" width="800" height="600"></p>
<p>Más en <a href="https://taller-demo.example/servicios/">servicios</a>.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>${it.id}</wp:post_id>
    <wp:post_date><![CDATA[${it.date} 09:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[${it.date} 14:00:00]]></wp:post_date_gmt>
    <wp:comment_status><![CDATA[open]]></wp:comment_status>
    <wp:ping_status><![CDATA[open]]></wp:ping_status>
    <wp:post_name><![CDATA[${it.slug}]]></wp:post_name>
    <wp:status><![CDATA[${it.status}]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[${it.type}]]></wp:post_type>
    <wp:post_password><![CDATA[]]></wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
    <category domain="category" nicename="mantenimiento"><![CDATA[Mantenimiento]]></category>
    <category domain="post_tag" nicename="${TAGS[it.id % TAGS.length]}"><![CDATA[${TAGS[it.id % TAGS.length]}]]></category>
  </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!-- Export WXR de PLACEHOLDER Taller Demo, generado por evals/fixtures/generate.mjs -->
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Taller Demo</title>
  <link>https://taller-demo.example</link>
  <description>Taller mecánico en Miami</description>
  <pubDate>Sat, 15 Jun 2024 12:00:00 +0000</pubDate>
  <language>es</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://taller-demo.example</wp:base_site_url>
  <wp:base_blog_url>https://taller-demo.example</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[ana]]></wp:author_login>
    <wp:author_email><![CDATA[ana@taller-demo.example]]></wp:author_email>
    <wp:author_display_name><![CDATA[Ana Pérez]]></wp:author_display_name>
  </wp:author>
  <generator>https://wordpress.org/?v=6.5</generator>
${itemXml}
</channel>
</rss>
`;
  write(file, xml);
}

// ---------------------------------------------------------------------------
// SPA-like
// ---------------------------------------------------------------------------

function generateSpa(root) {
  rmSync(root, { recursive: true, force: true });
  write(
    join(root, 'index.html'),
    `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taller Demo SPA</title>
<meta name="description" content="Versión SPA de PLACEHOLDER Taller Demo: el contenido se pinta por JavaScript.">
</head>
<body>
<div id="root"></div>
<script src="/app.js"></script>
</body>
</html>
`,
  );
  write(
    join(root, 'app.js'),
    `// app.js — inyecta el contenido en #root (fixture spa-like, sin dependencias)
(function () {
  var root = document.getElementById('root');
  if (!root) return;
  var h1 = document.createElement('h1');
  h1.textContent = 'Taller Demo (SPA)';
  root.appendChild(h1);
  var texts = [
    '${SENTENCES[0]}',
    '${SENTENCES[1]}',
    '${SENTENCES[2]}'
  ];
  for (var i = 0; i < texts.length; i++) {
    var p = document.createElement('p');
    p.textContent = texts[i];
    root.appendChild(p);
  }
})();
`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

generateWpLike(join(here, 'wp-like'));
generateWxr(join(here, 'wp-export.xml'));
generateSpa(join(here, 'spa-like'));
console.log('✓ fixtures generados en', here);
