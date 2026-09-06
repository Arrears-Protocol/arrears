'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { M, OUTCOME } from '../lib/manifest';
import { operatorState, ruledAt } from '../lib/chain';
import { Live } from './Live';
import { Tx } from './Hash';

/**
 * The four mined rulings, as THREE OUTCOME CLASSES — never as success and error.
 * A refusal is the system working, so nothing here is coloured like a failure.
 *
 * Each class is rendered as what it changed in the ledger, which makes them three distinct
 * facts rather than one good result and two bad ones. The row that earns its place is
 * "claims on record": a recorded refusal cost the operator nothing and still happened, while
 * the strict path left no trace at all.
 *
 * This section is deliberately independent of the interactive section and of pool state. If
 * every live call fails, the static argument still stands on its own.
 */
export function Outcomes() {
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
        if (R.strictRefusal?.sourceBlock) {
          // proves the strict path wrote nothing: claim.ruledAt is still 0
          const p = await import('../lib/chain');
          const pr = await p.preview(R.strictRefusal.sourceTx).catch(() => null);
          if (pr && !dead) setStrictTrace(await ruledAt(pr.height, pr.txIndex).catch(() => -1));
        }
      } catch { if (!dead) setLive('fail'); }
    })();
    return () => { dead = true; };
  }, [R.strictRefusal?.sourceTx, R.strictRefusal?.sourceBlock]);

  const eth = (w?: string) => (w ? `${Number(formatEther(w)).toLocaleString('en-US')} tCTC` : '—');

  const cards = [
    {
      cls: 'slashed' as const,
      tag: 'outcome 1 of 3',
      rows: [
        ['bond', '−2.0 tCTC', true],
        ['treasury', '+2.0 tCTC', true],
        ['credit limit', '1,000 → 750 tCTC', true],
        ['premium', '500 → 650 bps', true],
        ['strikes', '0 → 1', true],
        ['claims on record', '+1', true],
      ],
      hashes: [{ label: 'the ruling', hash: R.slash.hash!, note: `status 1 · ${R.slash.gasUsed?.toLocaleString('en-US')} gas` }],
      foot: 'previewClaim predicted OutOfGas and 2.0 tCTC before a wei was spent. The ruling matched exactly, and the reprice happened in the same transaction as the slash.',
    },
    {
      cls: 'recorded' as const,
      tag: 'outcome 2 of 3',
      rows: [
        ['bond', 'unchanged', false],
        ['treasury', 'unchanged', false],
        ['credit limit', 'unchanged', false],
        ['premium', 'unchanged', false],
        ['strikes', 'unchanged', false],
        ['claims on record', '+1', true],
      ],
      hashes: [{ label: 'the ruling', hash: R.refusal.hash!, note: `status 1 · ${R.refusal.gasUsed?.toLocaleString('en-US')} gas` }],
      foot: `SlashRefused carried ${R.refusal.refusalReasonSelector} — the selector of NotSlashableExplicitRevert, so the refusal is a named error in the ABI rather than a string. The failure is on the operator's record and cost them nothing.`,
    },
    {
      cls: 'refused' as const,
      tag: 'outcome 3 of 3',
      rows: [
        ['bond', 'unchanged', false],
        ['treasury', 'unchanged', false],
        ['credit limit', 'unchanged', false],
        ['premium', 'unchanged', false],
        ['strikes', 'unchanged', false],
        ['claims on record', strictTrace === 0 ? '0 — confirmed live' : '0', true],
      ],
      hashes: [
        { label: 'out of scope', hash: R.outOfScope.minedTx!, note: R.outOfScope.missAxis ? `miss = ${R.outOfScope.missAxis}` : '' },
        { label: 'strict path', hash: R.strictRefusal.minedTx!, note: 'nothing written' },
      ],
      foot: 'Two ways to be turned away. The strict path is the sharper one: after it, claim.ruledAt is still 0 — it refused and wrote nothing, which is what makes the two submission shapes a demonstrated fact rather than a design note.',
    },
  ];

  return (
    <section id="outcomes">
      <div className="wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
          <h2>Three outcomes, four rulings, all mined</h2>
          <Live state={live} label="operator state read live" />
        </div>
        <p style={{ marginBottom: 26 }}>
          Every one of these is a transaction on Creditcoin you can open in a block explorer we do
          not control. None of them is an error: <strong>a refusal is the system working.</strong>{' '}
          What separates them is what each one changed.
        </p>

        <div className="outcomes">
          {cards.map((c) => (
            <div key={c.cls} className={`oc ${c.cls}`}>
              <div className="tag">{c.tag}</div>
              <h3>{OUTCOME[c.cls].label}</h3>
              <div className="sub">{OUTCOME[c.cls].sub}</div>
              <ul className="delta">
                {c.rows.map(([l, v, chg]) => (
                  <li key={String(l)}>
                    <span className="lbl">{l}</span>
                    <span className={`val ${chg ? 'chg' : ''}`}>{v}</span>
                  </li>
                ))}
              </ul>
              <div className="hashes">
                {c.hashes.map((h) => (
                  <div key={h.hash}>
                    <Tx chain="cc3" hash={h.hash} label={`${h.label} ${h.hash.slice(0, 10)}…`} />
                    {h.note && <div className="small" style={{ paddingLeft: 0 }}>{h.note}</div>}
                  </div>
                ))}
              </div>
              <p className="small" style={{ marginTop: 14, marginBottom: 0 }}>{c.foot}</p>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="small" style={{ marginBottom: 6 }}>operator, read live from the registry</div>
              <dl className="kv">
                <dt>bonded</dt><dd>{state ? `${Number(formatEther(state.bonded)).toLocaleString('en-US')} tCTC` : eth(R.finalState.bondedWei)}</dd>
                <dt>slashed</dt><dd>{state ? `${Number(formatEther(state.slashed)).toLocaleString('en-US')} tCTC` : eth(R.finalState.slashedWei)}</dd>
                <dt>credit limit</dt><dd>{state ? `${Number(formatEther(state.limit)).toLocaleString('en-US')} tCTC` : eth(R.finalState.creditLimitWei)}</dd>
                <dt>premium</dt><dd>{state ? state.premiumBps : R.finalState.premiumBps} bps</dd>
                <dt>strikes</dt><dd>{state ? state.strikes : R.finalState.strikes}</dd>
                <dt>claims</dt><dd>{state ? state.claimCount : 2}</dd>
              </dl>
            </div>
            <div style={{ maxWidth: '40ch' }}>
              <p className="small" style={{ margin: 0 }}>
                A relayer paid the gas for all four and a separate beneficiary was credited. That
                is sponsored submission working with no meta-transaction machinery: filing a claim
                borrows no authority from anyone, so the relayer is simply the sender.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
