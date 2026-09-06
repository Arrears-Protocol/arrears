'use client';
/** A confirmation mark, never a spinner.
 *  The resting state is "not yet confirmed", which looks like a complete page with one fewer
 *  mark on it -- not like something loading. Nothing here ever blocks a render. */
export function Live({ state, label = 'confirmed live' }: { state: 'idle' | 'ok' | 'fail'; label?: string }) {
  if (state === 'idle') return <span className="live"><span className="dot" />reading…</span>;
  if (state === 'fail') return <span className="live off"><span className="dot" />chain unreachable — shown from record</span>;
  return <span className="live on"><span className="dot" />{label}</span>;
}
