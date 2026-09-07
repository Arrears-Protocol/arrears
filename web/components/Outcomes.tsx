'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { M, OUTCOME } from '../lib/manifest';
import { operatorState, ruledAt } from '../lib/chain';
import { Live } from './Live';
import { Tx } from './Hash';
import { Container, Reveal, SectionHead, Panel, Eyebrow } from './ui/primitives';

/**
 * Three outcome classes, four mined rulings — never success and error.
 *
 * Shell harvested from productized-agency-template's Comparison section: a
 * three-column grid whose columns each carry a row list. Their rows are feature
 * ticks; ours are ledger deltas. The shell's job is to make three things
 * comparable at a glance, which is exactly what we need and exactly what a
 * pricing grid is shaped for.
 *
 * Each card is stamped with the CC3 block it was ruled at, because the live panel
 * below has moved on since — and that gap is evidence, not an inconsistency.
 *
 * The card rows are hardcoded deltas because they are facts about one mined
 * ruling and cannot drift. The live panel's figures come from the chain: read on
 * the server for the first paint (so a reader with no JavaScript gets real
 * numbers, not stale ones), then re-read in the browser.
 */
export type InitialState = {
  bondedWei: string; slashedWei: string; limitWei: string;
  premiumBps: number; strikes: number; claimCount: number;
} | null;

export function Outcomes({ initial }: { initial: InitialState }) {
  const R = M.rulings;
  const [live, setLive] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [state, setState] = useState<Awaited<ReturnType<typeof operatorState>> | null>(null);
  const [strictTrace, setStrictTrace] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const s = await operatorState();
        if (!dead) { setState(s); setLive('ok'); }
        const p = await import('../lib/chain');
        const pr = await p.preview(R.strictRefusal.sourceTx).catch(() => null);
        if (pr && !dead) setStrictTrace(await ruledAt(pr.height, pr.txIndex).catch(() => -1));
      } catch { if (!dead) setLive('fail'); }
    })();
    return () => { dead = true; };
  }, [R.strictRefusal.sourceTx]);

  const eth = (w?: string) => (w ? `${Number(formatEther(w)).toLocaleString('en-US')} tCTC` : '—');

  const cards = [
    {
      cls: 'slashed' as const, tone: 'moved' as const, tag: 'outcome 1 of 3', at: R.slash,
      rows: [['bond', '−2.0 tCTC', 1], ['treasury', '+2.0 tCTC', 1], ['credit limit', '1,000 → 750 tCTC', 1],
             ['premium', '500 → 650 bps', 1], ['strikes', '0 → 1', 1], ['claims on record', '+1', 1]] as const,
      hashes: [{ label: 'the ruling', hash: R.slash.hash!, note: `status 1 · ${R.slash.gasUsed?.toLocaleString('en-US')} gas` }],
      foot: 'previewClaim predicted OutOfGas and 2.0 tCTC before a wei was spent. The ruling matched exactly, and the reprice happened in the same transaction as the slash.',
    },
    {
      cls: 'recorded' as const, tone: 'kept' as const, tag: 'outcome 2 of 3', at: R.refusal,
      rows: [['bond', 'unchanged', 0], ['treasury', 'unchanged', 0], ['credit limit', 'unchanged', 0],
             ['premium', 'unchanged', 0], ['strikes', 'unchanged', 0], ['claims on record', '+1', 1]] as const,
      hashes: [{ label: 'the ruling', hash: R.refusal.hash!, note: `status 1 · ${R.refusal.gasUsed?.toLocaleString('en-US')} gas` }],
      foot: `SlashRefused carried ${R.refusal.refusalReasonSelector} — the selector of NotSlashableExplicitRevert, so the refusal is a named error in the ABI rather than a string. The failure is on the operator's record and cost them nothing.`,
    },
    {
      cls: 'refused' as const, tone: 'away' as const, tag: 'outcome 3 of 3', at: R.outOfScope,
      rows: [['bond', 'unchanged', 0], ['treasury', 'unchanged', 0], ['credit limit', 'unchanged', 0],
             ['premium', 'unchanged', 0], ['strikes', 'unchanged', 0],
             ['claims on record', strictTrace === 0 ? '0 · confirmed' : '0', 1]] as const,
      hashes: [
        { label: 'out of scope', hash: R.outOfScope.minedTx!, note: R.outOfScope.missAxis ? `miss = ${R.outOfScope.missAxis}` : '' },
        { label: 'strict path', hash: R.strictRefusal.minedTx!, note: 'nothing written' },
      ],
      foot: 'Two ways to be turned away. The strict path is the sharper one: after it, claim.ruledAt is still 0 — it refused and wrote nothing, which is what makes the two submission shapes a demonstrated fact rather than a design note.',
    },
  ];

  const now = [
    ['bonded', state ? `${Number(formatEther(state.bonded)).toLocaleString('en-US')} tCTC` : eth(initial?.bondedWei)],
    ['slashed', state ? `${Number(formatEther(state.slashed)).toLocaleString('en-US')} tCTC` : eth(initial?.slashedWei)],
    ['credit limit', state ? `${Number(formatEther(state.limit)).toLocaleString('en-US')} tCTC` : eth(initial?.limitWei)],
    ['premium', `${state?.premiumBps ?? initial?.premiumBps ?? '—'} bps`],
    ['strikes', String(state?.strikes ?? initial?.strikes ?? '—')],
    ['claims on record', String(state?.claimCount ?? initial?.claimCount ?? '—')],
  ];
  const count = state?.claimCount ?? initial?.claimCount ?? 0;
  const since = Math.max(0, count - 4);

  return (
    <section id="outcomes" className="py-24">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="Three outcomes · four rulings · all mined"
            title={<>A refusal is the system working.</>}
            right={<Live state={live} label="operator read live" />}
          >
            Every one of these is a transaction on Creditcoin you can open in a block explorer we
            do not control. None of them is an error — a refusal is the system working. What
            separates them is what each one changed.
          </SectionHead>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.cls} delay={0.06 * i}>
              <Panel tone={c.tone} className="flex h-full flex-col p-6">
                <div className="mono text-[10.5px] uppercase tracking-[0.13em]" style={{ color: `var(--${c.tone})` }}>
                  {c.tag}
                </div>
                <h3 className="display mt-2.5 text-[24px] leading-none">{OUTCOME[c.cls].label}</h3>
                <div className="mt-2 min-h-[38px] text-[13.5px] leading-snug text-fg-3">{OUTCOME[c.cls].sub}</div>

                {c.at?.cc3Block && (
                  <div className="mono mt-3 border-y border-dashed border-line py-2 text-[10.5px] text-fg-3">
                    as at CC3 block {c.at.cc3Block.toLocaleString('en-US')}
                    {c.at.ruledAtISO ? ` · ${c.at.ruledAtISO.slice(0, 16).replace('T', ' ')}` : ''}
                  </div>
                )}

                <ul className="mt-3">
                  {c.rows.map(([l, v, chg]) => (
                    <li key={l} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-[7px] last:border-0">
                      <span className="mono text-[12px] text-fg-3">{l}</span>
                      <span className="mono text-right text-[12.5px]"
                        style={{ color: chg ? `var(--${c.tone})` : 'var(--fg-2)', fontWeight: chg ? 600 : 400 }}>
                        {v}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mono mt-4 space-y-1.5 border-t border-line-soft pt-3.5 text-[11.5px]">
                  {c.hashes.map((h) => (
                    <div key={h.hash}>
                      <Tx chain="cc3" hash={h.hash} label={`${h.label} ${h.hash.slice(0, 10)}…`} />
                      {h.note && <div className="text-fg-3">{h.note}</div>}
                    </div>
                  ))}
                </div>

                <p className="mt-auto pt-4 text-[12.5px] leading-relaxed text-fg-3">{c.foot}</p>
              </Panel>
            </Reveal>
          ))}
        </div>

        {/* The live panel outranks the frozen cards, deliberately. */}
        <Reveal delay={0.2}>
          <div className="relative mt-5 overflow-hidden rounded-[14px] border border-line bg-bg-sunken p-6 md:p-7">
            <div aria-hidden className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: 'linear-gradient(90deg, var(--moved), var(--kept), var(--away))' }} />
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow className="text-fg">The operator right now</Eyebrow>
                <div className="mt-1 text-[13.5px] text-fg-3">read live from the registry, this second</div>
              </div>
              <Live state={live} label="live" />
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border border-line bg-line md:grid-cols-6">
              {now.map(([k, v]) => (
                <div key={k} className="bg-bg-raised px-3.5 py-3.5">
                  <div className="mono text-[10px] uppercase tracking-[0.09em] text-fg-3">{k}</div>
                  <div className="mono mt-1.5 text-[15px] font-semibold text-fg">{v}</div>
                </div>
              ))}
            </div>

            <p className="mt-5 max-w-[80ch] text-[13.5px] leading-relaxed text-fg-2">
              <strong className="text-fg">These numbers are further along than the three cards
              above, and that gap is the point.</strong> Each card is frozen at the block it was
              ruled at. Every claim filed since — including any a visitor filed from this page —
              has moved the operator on: more strikes, a lower limit, a higher premium. The record
              only accumulates.
              {since > 0 && <> {since} claim{since === 1 ? ' has' : 's have'} been filed since those four.</>}
            </p>
            <p className="mt-3 max-w-[80ch] text-[13px] leading-relaxed text-fg-3">
              A relayer paid the gas for all of them and a separate beneficiary was credited each
              time. Filing a claim borrows no authority from anyone, so the relayer is simply the
              sender — sponsored submission with no meta-transaction machinery.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
