'use client';
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * Reveal on scroll — and CORRECT WITHOUT JAVASCRIPT.
 *
 * The earlier version used motion's `initial={{ opacity: 0 }}`, which serialises
 * into the server HTML. Every section was therefore present in the DOM and
 * invisible to a reader without JS, while a content-only assertion suite
 * reported all 19 checks green. The page looked blank and the tests looked fine.
 *
 * Now the hidden state is applied ONLY under `html.js`, a class an inline script
 * in <head> sets before first paint. No JS, no class, nothing hidden — the page
 * renders complete and static. With JS the class is there before paint, so
 * there is no flash of content either.
 */
export function Reveal({
  children, delay = 0, className,
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in');
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } },
      { rootMargin: '-8% 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('reveal', className)} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
