/**
 * gsap-scrollytelling.ts — Preset "expresivo" (opt-in) con GSAP 3.15.
 *
 * GSAP 3.15 es 100 % gratis, incluidos ScrollTrigger y SplitText (verificado
 * en versions.md). Peso aprox.: core ~24 KB gz + ScrollTrigger ~13 KB + SplitText ~8 KB
 * → ~45 KB gz. Agota casi solo el presupuesto de la página (≤ 30–50 KB gz de JS
 * de movimiento), así que SOLO para la sección "firma" de un scrollytelling,
 * nunca para reveals genéricos (eso es `reveal.css`, 0 KB).
 *
 * Imports verificados (ESM, con types incluidos en el paquete):
 *   import gsap from 'gsap';
 *   import { ScrollTrigger } from 'gsap/ScrollTrigger';
 *   import { SplitText } from 'gsap/SplitText';
 *   gsap.registerPlugin(ScrollTrigger, SplitText);   // obligatorio una vez
 *
 * Patrón de carga en Astro (el chunk de GSAP NO entra en el bundle inicial):
 *
 *   <section id="story" data-story>…</section>
 *   <script>
 *     const el = document.querySelector<HTMLElement>('[data-story]');
 *     if (el) {
 *       const io = new IntersectionObserver(async ([e]) => {
 *         if (!e.isIntersecting) return;
 *         io.disconnect();
 *         const { initScrollytelling } = await import('../scripts/gsap-scrollytelling');
 *         initScrollytelling(el);
 *       }, { rootMargin: '200px' });
 *       io.observe(el);
 *     }
 *   </script>
 *
 * Si la sección ya es una isla React (client:visible), llama a
 * `initScrollytelling(ref.current)` en un `useEffect` y devuelve su `destroy`.
 *
 * Reduced-motion: `gsap.matchMedia()` solo crea la escena bajo
 * `(prefers-reduced-motion: no-preference)`. Con `reduce`, el DOM queda intacto
 * (texto sin dividir, imágenes en su sitio). Al cambiar la preferencia en vivo,
 * GSAP revierte todo automáticamente (`revert()` en el contexto).
 *
 * Marcado esperado dentro del contenedor:
 *   [data-story-title]   titular que se revela por líneas (SplitText)
 *   [data-story-step]    N pasos que se iluminan al pasar (clase .is-active)
 *   [data-story-media]   figura "pineada" mientras avanzan los pasos
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface ScrollytellingOptions {
  /** Easing para las entradas. Por defecto el "expo out" del kit. */
  ease?: string;
  /** Distancia del pin en viewports (1 = 100vh por paso). */
  pinPerStep?: number;
}

export interface ScrollytellingControls {
  /** Mata triggers, revierte SplitText y limpia estilos inline. */
  destroy: () => void;
}

export function initScrollytelling(
  root: HTMLElement,
  { ease = 'expo.out', pinPerStep = 0.8 }: ScrollytellingOptions = {},
): ScrollytellingControls {
  const mm = gsap.matchMedia();

  mm.add(
    {
      // Condiciones nombradas: GSAP crea el contexto solo cuando `motionOk` es true
      // y lo revierte (DOM + estilos) si deja de cumplirse.
      motionOk: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 768px)',
    },
    (ctx) => {
      const { motionOk = false, desktop = false } = ctx.conditions ?? {};
      if (!motionOk) return;

      const title = root.querySelector<HTMLElement>('[data-story-title]');
      const steps = gsap.utils.toArray<HTMLElement>('[data-story-step]', root);
      const media = root.querySelector<HTMLElement>('[data-story-media]');

      // 1. Titular: reveal por líneas con máscara. `aria: 'auto'` mantiene el
      //    texto legible para lectores de pantalla; `autoSplit` re-divide al
      //    cambiar el ancho o cargar la fuente (evita líneas rotas).
      if (title) {
        SplitText.create(title, {
          type: 'lines',
          mask: 'lines',
          aria: 'auto',
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 110,
              duration: 0.9,
              ease,
              stagger: 0.08,
              scrollTrigger: { trigger: title, start: 'top 80%', once: true },
            }),
        });
      }

      // 2. Pasos: cada uno activa su estado al cruzar el centro del viewport.
      //    Solo cambiamos una clase (sin medir layout dentro del callback).
      steps.forEach((step, i) => {
        ScrollTrigger.create({
          trigger: step,
          start: 'top center',
          end: 'bottom center',
          onToggle: ({ isActive }) => {
            step.classList.toggle('is-active', isActive);
            if (media) media.dataset.step = String(i);
          },
        });
      });

      // 3. Figura "pineada" solo en escritorio (en móvil el pin roba pantalla).
      //    `pinSpacing: false` si el contenedor ya reserva altura con CSS.
      if (media && desktop && steps.length > 0) {
        ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: () => `+=${window.innerHeight * pinPerStep * steps.length}`,
          pin: media,
          anticipatePin: 1,
        });
      }

      // Lo que se devuelve aquí se ejecuta al revertir el contexto (cleanup extra).
      return () => {
        steps.forEach((s) => s.classList.remove('is-active'));
        if (media) delete media.dataset.step;
      };
    },
  );

  // Los tamaños de imágenes/fuentes pueden cambiar tras el init: recalcula.
  const onLoad = () => ScrollTrigger.refresh();
  window.addEventListener('load', onLoad, { once: true });

  return {
    destroy: () => {
      window.removeEventListener('load', onLoad);
      mm.revert();
    },
  };
}
