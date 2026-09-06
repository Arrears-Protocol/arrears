'use client';
import { cn } from '../lib/cn';

/** A confirmation mark, never a spinner. The resting state is "not yet
 *  confirmed" — a complete page with one fewer mark, not something loading. */
export function Live({ state, label = 'confirmed live' }: { state: 'idle' | 'ok' | 'fail'; label?: string }) {
  const text = state === 'idle' ? 'reading…' : state === 'fail' ? 'chain unreachable — shown from record' : label;
  return (
    <span className={cn('mono inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.11em]',
      state === 'ok' ? 'text-pass' : state === 'fail' ? 'text-miss' : 'text-fg-3')}>
      <span className="h-[5px] w-[5px] rounded-full"
        style={{ background: state === 'ok' ? 'var(--pass)' : state === 'fail' ? 'var(--miss)' : 'var(--line)' }} />
      {text}
    </span>
  );
}
