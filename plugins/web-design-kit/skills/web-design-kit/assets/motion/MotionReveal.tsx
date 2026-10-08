/**
 * MotionReveal.tsx — Isla React con `motion` v14 (antes framer-motion).
 *
 * Cuándo usarla: SOLO cuando el bloque ya es React por otra razón (estado,
 * gestos, layout animations). Para un reveal de HTML estático usa `reveal.css`
 * (0 KB). Este componente cuesta ~18–22 KB gz (motion/react) + React.
 *
 * Imports verificados con motion 14.0.0:
 *   import { motion, useReducedMotion } from 'motion/react';       // core React
 *   import { AnimateView } from 'motion/react-animate-view';       // entry APARTE
 *   `AnimateView` NO se exporta desde 'motion/react'. Requiere React 19.3+.
 *
 * Montaje en Astro (carga diferida: el JS solo baja al entrar en viewport):
 *   <MotionReveal client:visible>
 *     <h2>Título</h2>
 *     <p>Texto…</p>
 *   </MotionReveal>
 *
 * Contrato reduced-motion: con `prefers-reduced-motion: reduce` no hay
 * desplazamiento ni escalonado; `initial={false}` pinta el estado final
 * directamente (sin flash de opacity 0). Si JS falla o tarda, Astro ya ha
 * renderizado el HTML en el servidor y es visible: el `initial` solo aplica
 * tras hidratar.
 *
 * Perf: solo `opacity` y `y` (transform). `viewport.once` evita re-animar al
 * volver a hacer scroll. Sin `layout` prop aquí (fuerza lecturas de layout).
 */
import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface MotionRevealProps {
  children: ReactNode;
  /** Elemento contenedor (section, div, ul…). Por defecto `div`. */
  as?: 'div' | 'section' | 'ul' | 'ol' | 'article';
  /** Clases Tailwind del contenedor. */
  className?: string;
  /** Desplazamiento inicial en px (eje Y). Mantener ≤ 24 para no parecer "salto". */
  distance?: number;
  /** Retardo entre hijos directos, en segundos. */
  stagger?: number;
  /** Porcentaje del bloque que debe verse para disparar (0–1). */
  amount?: number;
  style?: CSSProperties;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MotionReveal({
  children,
  as = 'div',
  className,
  distance = 16,
  stagger = 0.08,
  amount = 0.35,
  style,
}: MotionRevealProps) {
  // `null` durante SSR → tratamos como "sin preferencia" pero sin animar
  // hasta hidratar (initial=false evita el flash).
  const reduced = useReducedMotion() ?? false;

  const container: Variants = {
    hidden: {},
    show: {
      transition: reduced ? { duration: 0 } : { staggerChildren: stagger, delayChildren: 0.05 },
    },
  };

  const item: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: distance },
    show: {
      opacity: 1,
      y: 0,
      transition: reduced ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT_EXPO },
    },
  };

  // motion.div / motion.section / … según `as`. El cast es necesario porque
  // `motion[as]` indexa un proxy tipado por etiqueta.
  const Container = motion[as] as ElementType;
  const Child = motion.div;

  // Envolvemos cada hijo directo para poder escalonarlos. Si no quieres el
  // <div> extra, pasa un único hijo y usa `distance` sin `stagger`.
  const items = Array.isArray(children) ? children : [children];

  return (
    <Container
      className={className}
      style={style}
      variants={container}
      initial={reduced ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {/* Sin `will-change` manual: motion lo aplica solo mientras anima y lo retira al terminar. */}
      {items.map((child, i) => (
        <Child key={i} variants={item}>
          {child}
        </Child>
      ))}
    </Container>
  );
}
