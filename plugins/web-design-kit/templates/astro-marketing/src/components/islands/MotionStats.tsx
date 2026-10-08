/**
 * Isla React de ejemplo con `motion` v14 (`import { motion } from "motion/react"`).
 *
 * Se carga con `client:visible`, así su JS solo se descarga cuando el bloque
 * entra en el viewport. El resto de la página sigue siendo HTML puro.
 *
 * Respeta `prefers-reduced-motion` con `useReducedMotion`: sin movimiento, los
 * números aparecen directamente en su valor final.
 *
 * Los valores son PLACEHOLDER: sustitúyelos por métricas reales del cliente o
 * elimina la isla. Nunca publiques cifras inventadas.
 */
import { motion, useReducedMotion, animate, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

export interface Stat {
  value: number;
  suffix?: string;
  label: string;
}

interface Props {
  stats: Stat[];
}

function Counter({ value, suffix = '', reduced }: { value: number; suffix?: string; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString('es')}
      {suffix}
    </span>
  );
}

export default function MotionStats({ stats }: Props) {
  const reduced = useReducedMotion() ?? false;

  return (
    <ul className="grid gap-8 sm:grid-cols-3" role="list">
      {stats.map((stat, i) => (
        <motion.li
          key={stat.label}
          initial={reduced ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="border-t border-line pt-5"
        >
          <p className="font-display text-4xl font-medium tracking-tight">
            <Counter value={stat.value} suffix={stat.suffix} reduced={reduced} />
          </p>
          <p className="mt-2 text-sm text-muted">{stat.label}</p>
        </motion.li>
      ))}
    </ul>
  );
}
