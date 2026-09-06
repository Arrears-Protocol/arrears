import { cn } from '../lib/cn';

/**
 * The fault line, as a component.
 *
 * Traffic floods down the left lane. At the measured rate — 1.47% — one turns
 * and marks itself reverted. Of those, at the measured rate — 10.3% — one flags
 * out of gas, and that is the only lane Arrears will slash.
 *
 * ── Why the right two lanes ACCUMULATE rather than scroll ─────────────────────
 *
 * A first version scrolled all three lanes at the true 1-in-660 rate. It was
 * accurate and it taught nothing: the out-of-gas lane — the one the whole
 * product turns on — was empty for about 96% of the cycle, so a reader glancing
 * at it saw an empty column. Literal representation of a rare event does not
 * survive a small window.
 *
 * So the flood scrolls and the consequences stay. At any moment you see a lot of
 * traffic, a short stack of reverts, and one slashable mark. The ratio is
 * legible in a single glance instead of requiring a lucky one, and it is still
 * the real ratio: exactly 660 : 10 : 1 per cycle.
 *
 * ── Why it is pure CSS ────────────────────────────────────────────────────────
 *
 * No JavaScript drives any of it. The server HTML already contains every mark,
 * so the no-JS path gets the whole component rather than an empty box; there is
 * no hydration mismatch, because nothing is random at runtime; and the browser
 * composites transforms instead of running a rAF loop next to a headline this
 * must not compete with.
 */

const SLOTS = 660;                 // transactions per cycle
const PITCH = 7;                   // 3px dash + 4px gap: discrete objects, not hatch
const REVERTS = 10;                // 10/660 = 1.52%   (measured 1.47%)
const OOG = 1;                     // 1/10 of reverts  (measured 10.3%)
const CYCLE_PX = SLOTS * PITCH;
const SECONDS = 26;
const ROW = 26;                    // vertical pitch of an accumulated mark

/** When each revert lands, in seconds. Deterministic, generated once. */
function schedule() {
  let s = 0x9e3779b9;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const at: number[] = [];
  for (let i = 0; i < REVERTS; i++) {
    const band = (i + 0.15 + rnd() * 0.7) / REVERTS;
    at.push(+(band * SECONDS).toFixed(2));
  }
  return at.sort((a, b) => a - b);
}
const AT = schedule();
const OOG_INDEX = Math.floor(REVERTS / 2);   // exactly one, mid-cycle

export function FaultStream({ className }: { className?: string }) {
  return (
    <div className={cn('select-none', className)} aria-hidden>
      <div className="rounded-card border border-line bg-bg-raised">
        <div className="mono grid grid-cols-[1.05fr_1fr_1fr] border-b border-line-soft px-3 py-2.5 text-[9px] uppercase tracking-[0.08em]">
          <span className="text-fg-3">all traffic</span>
          <span style={{ color: 'var(--miss)' }}>reverted</span>
          <span style={{ color: 'var(--moved)' }}>out of gas</span>
        </div>

        <div className="relative h-[380px] overflow-hidden">
          <div className="absolute inset-y-0 left-[35%] w-px bg-line-soft" />
          <div className="absolute inset-y-0 left-[67%] w-px bg-line-soft" />

          {/* the flood: 660 transactions as one scrolling gradient, not 660 nodes */}
          <div className="fs-flood absolute inset-y-0 left-0 w-[31%]" />

          {/* the consequences: they land, and they stay */}
          <div className="absolute inset-y-0 left-[35%] right-0">
            {AT.map((t, i) => {
              const oog = i === OOG_INDEX;
              return (
                <div
                  key={t}
                  className="fs-land absolute"
                  style={{
                    top: 16 + i * ROW,
                    left: oog ? '49.2%' : 0,
                    right: oog ? 10 : '52%',
                    animationDelay: `${t}s`,
                  }}
                >
                  <div
                    className="rounded-[1px]"
                    style={{ height: oog ? 5 : 3, background: oog ? 'var(--moved)' : 'var(--miss)' }}
                  />
                  <div
                    className="mono mt-1 whitespace-nowrap text-[8px] uppercase tracking-[0.06em]"
                    style={{ color: oog ? 'var(--moved)' : 'var(--miss)', fontWeight: oog ? 700 : 400 }}
                  >
                    {oog ? 'slashable' : 'recorded'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 h-10"
               style={{ background: 'linear-gradient(var(--bg-raised), transparent)' }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
               style={{ background: 'linear-gradient(transparent, var(--bg-raised))' }} />
        </div>

        {/* the numbers, so the ratios read as data and not as art direction */}
        <div className="mono border-t border-line-soft px-3 py-2.5 text-[9.5px] leading-[1.75] text-fg-3">
          <div className="flex justify-between gap-2">
            <span>transactions per cycle</span><span className="text-fg-2">{SLOTS}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span style={{ color: 'var(--miss)' }}>reverted · measured 1.47%</span>
            <span className="text-fg-2">{REVERTS}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span style={{ color: 'var(--moved)' }}>out of gas · measured 10.3% of those</span>
            <span className="text-fg-2">{OOG}</span>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-fg-3">
        Measured proportions: 49,140 mainnet transactions across 200 attested blocks. Only the last
        column is slashable.
      </p>

      <style>{`
        .fs-flood {
          background-image: repeating-linear-gradient(
            to bottom, var(--fg-3) 0 3px, transparent 3px ${PITCH}px);
          opacity: .34;
          animation: fs-scroll ${SECONDS}s linear infinite;
        }
        @keyframes fs-scroll {
          from { background-position-y: 0 }
          to   { background-position-y: ${CYCLE_PX}px }
        }
        /* A mark arrives at its own moment and holds for the rest of the cycle,
           so the stack builds. No JS: one delayed keyframe per mark. */
        .fs-land {
          opacity: 0;
          animation: fs-land ${SECONDS}s linear infinite;
        }
        @keyframes fs-land {
          0%   { opacity: 0; transform: translateX(-6px) }
          1.5% { opacity: 1; transform: translateX(0) }
          100% { opacity: 1; transform: translateX(0) }
        }
        /* Reduced motion: hold the composed state. Every mark is present, the
           flood is present, the ratio still reads — it simply does not move. */
        @media (prefers-reduced-motion: reduce) {
          .fs-flood, .fs-land { animation: none !important; }
          .fs-land { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
