/**
 * lenis-optin.ts — Smooth scroll con Lenis 1.3.x. OPT-IN. NUNCA por defecto.
 *
 * Por qué no es default: el smooth scroll secuestra la rueda del ratón (lo que
 * el usuario percibe como "scroll-jacking"), rompe la expectativa de velocidad
 * nativa, interfiere con `scroll-behavior: smooth`, con los anclas, con el
 * find-in-page y suma ~8 KB gz + un rAF permanente en el hilo principal (INP).
 * Solo se justifica en un scrollytelling "expresivo" donde el cliente lo pide
 * explícitamente y la sección GSAP depende de la inercia.
 *
 * Import verificado (lenis 1.3.26):  import Lenis from 'lenis';
 * El paquete `@studio-freight/lenis` está deprecado: no lo uses.
 * CSS recomendado por Lenis (añádelo en global.css si activas esto):
 *   html.lenis, html.lenis body { height: auto; }
 *   .lenis.lenis-smooth { scroll-behavior: auto !important; }
 *   .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
 *   .lenis.lenis-stopped { overflow: hidden; }
 *
 * Guardas (todas deben cumplirse, si no devuelve `null` y el scroll es nativo):
 *   1. `prefers-reduced-motion: no-preference`  (además Lenis trae
 *      `respectReducedMotion: true` por defecto, doble cinturón).
 *   2. `(pointer: fine)` — en táctil el scroll nativo ya tiene inercia física;
 *      Lenis en móvil solo añade latencia. `syncTouch` queda en false.
 *   3. Sin `?nosmooth` en la URL (escape para QA y para usuarios).
 *
 * Uso en Astro (chunk diferido, no bloquea el LCP):
 *   <script>
 *     import('../scripts/lenis-optin').then(({ initLenis }) => initLenis());
 *   </script>
 *
 * Con GSAP ScrollTrigger en la misma página, pasa `{ scrollTrigger: ScrollTrigger }`
 * para que ambos compartan ticker y ScrollTrigger se actualice en cada frame.
 */
import Lenis from 'lenis';

export interface LenisOptinOptions {
  /** Intensidad de interpolación (0–1). 0.1 = muy suave, 0.2 = casi nativo. */
  lerp?: number;
  /** Si se pasa ScrollTrigger (de gsap/ScrollTrigger), se sincronizan. */
  scrollTrigger?: { update: () => void };
}

export interface LenisOptinControls {
  lenis: Lenis;
  destroy: () => void;
}

export function canUseLenis(): boolean {
  if (typeof window === 'undefined') return false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const optOut = new URLSearchParams(window.location.search).has('nosmooth');
  return !reduced && finePointer && !optOut;
}

export function initLenis({ lerp = 0.12, scrollTrigger }: LenisOptinOptions = {}): LenisOptinControls | null {
  if (!canUseLenis()) return null;

  const lenis = new Lenis({
    lerp,
    smoothWheel: true,
    syncTouch: false, // táctil = nativo
    anchors: true, // mantiene <a href="#id"> funcionando
    allowNestedScroll: true, // no rompe scroll interno de modales/listas
    respectReducedMotion: true,
    autoRaf: false, // gestionamos el rAF para poder pararlo al destruir
  });

  // Un solo bucle de animación. Si hay ScrollTrigger, lo actualizamos aquí.
  let frame = 0;
  const raf = (time: number) => {
    lenis.raf(time);
    frame = requestAnimationFrame(raf);
  };
  frame = requestAnimationFrame(raf);

  const off = scrollTrigger ? lenis.on('scroll', () => scrollTrigger.update()) : undefined;

  // Si el usuario activa reduced-motion en vivo, apagamos el smoothing del todo.
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    if (mq.matches) destroy();
  };
  mq.addEventListener('change', onChange);

  function destroy() {
    cancelAnimationFrame(frame);
    off?.();
    mq.removeEventListener('change', onChange);
    lenis.destroy();
  }

  return { lenis, destroy };
}
