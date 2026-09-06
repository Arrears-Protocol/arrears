'use client';
import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { cn } from '../../lib/cn';

/* ─────────────────────────────────────────────────────────────────────────────
   Harvested primitives, normalised onto the Arrears token system.

   Container / DivideX / Rail       ← nodus-agent-template
   Ambient (static radial wash)     ← proactiv-marketing-template
   Reveal                           ← ours, on motion: reveal-on-scroll only.
                                       Never loops, never animates a number.
   ───────────────────────────────────────────────────────────────────────────── */

export const Container = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-6xl px-6 md:px-10', className)}>{children}</div>
);

/** nodus's section divider: one hairline, full width. The device that makes
 *  stacked sections read as one document rather than as separate cards. */
export const DivideX = ({ className }: { className?: string }) => (
  <div className={cn('h-px w-full bg-divide', className)} />
);

export const Rail = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-6xl border-x border-divide px-6 md:px-10', className)}>{children}</div>
);

/** proactiv's ambient wash, recoloured to our ramp and made STATIC.
 *  Static is the point: looping motion behind an evidence document undercuts it. */
export const Ambient = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[46rem] overflow-hidden', className)}>
    <div
      className="absolute left-1/2 top-[-18rem] h-[46rem] w-[64rem] -translate-x-1/2"
      style={{ background: 'radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--fg) 7%, transparent) 0%, transparent 72%)' }}
    />
    <div className="dotgrid absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" />
  </div>
);

/** Reveal on scroll. Content arrives as you reach it, then stays put.
 *  `once` so nothing re-animates on scroll-back. */
export function Reveal({
  children, delay = 0, y = 14, className,
}: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px -8% 0px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mono text-[11px] uppercase tracking-[0.16em] text-fg-3', className)}>{children}</div>
);

export const SectionHead = ({
  eyebrow, title, children, right,
}: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-10">
    <div className="flex flex-wrap items-start justify-between gap-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      {right}
    </div>
    <h2 className="display mt-4 max-w-[24ch] text-[34px] leading-[1.1] tracking-[-0.015em] md:text-[44px]">
      {title}
    </h2>
    {children && <div className="mt-4 max-w-[68ch] text-[15.5px] leading-[1.65] text-fg-2">{children}</div>}
  </div>
);

/** The one card shell every panel uses, so nothing reads as foreign. */
export const Panel = ({
  children, className, tone,
}: { children: React.ReactNode; className?: string; tone?: 'moved' | 'kept' | 'away' }) => (
  <div
    className={cn('rounded-[14px] border border-line bg-bg-raised', tone && 'border-t-2', className)}
    style={tone ? { borderTopColor: `var(--${tone})` } : undefined}
  >
    {children}
  </div>
);
