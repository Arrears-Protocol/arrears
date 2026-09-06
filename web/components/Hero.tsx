'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { M } from '../lib/manifest';
import { preview, operatorState, type MissName } from '../lib/chain';
import { Live } from './Live';
import { Tx, Addr } from './Hash';
import { short } from '../lib/explorer';

/**
 * The site opens on a REFUSAL, not the slash.
 *
 * Any project can pay out. What shows the rule is load-bearing is the system turning away a real
 * failure it had every opportunity to punish: a genuine WETH.withdraw() failure, by the bonded
 * operator, inside the covered window, on the covered contract — refused, because that one
 * selector is not in scope.
 *
 * Four of the five axes pass. That is the point.
 */
export function Hero() {
  const r = M.rulings.outOfScope;
  const cov = M.operator.coverages[0];
  const [live, setLive] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [miss, setMiss] = useState<MissName | null>(null);
  // Read the bond rather than asserting it: every demo claim moves it, and a hardcoded figure
  // would be wrong within the hour.
  const [bonded, setBonded] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    preview(r.sourceTx, ac.signal)
      .then((p) => { setMiss(p.miss); setLive(p.miss === 'Selector' ? 'ok' : 'fail'); })
      .catch(() => setLive('fail'));
    operatorState()
      .then((s) => setBonded(Number(formatEther(s.bonded)).toLocaleString('en-US')))
      .catch(() => {});
    return () => ac.abort();
  }, [r.sourceTx]);

  const axes = [
    { k: 'operator', v: short(M.operator.sourceAddress, 10, 4), n: bonded ? `${bonded} tCTC bonded` : 'bonded on Creditcoin', ok: true },
    { k: 'chain', v: 'Ethereum Sepolia', n: 'Attestcoin chain key 1', ok: true },
    { k: 'window', v: `${cov.fromHeight.toLocaleString('en-US')} – ${cov.toHeight.toLocaleString('en-US')}`, n: `block ${r.sourceBlock.toLocaleString('en-US')} is inside`, ok: true },
    { k: 'contract', v: short('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 10, 4), n: 'WETH9 — covered', ok: true },
    { k: 'selector', v: '0x2e1a7d4d', n: 'withdraw(uint256) — in no coverage', ok: false },
  ];

  return (
    <section id="hero">
      <div className="wrap">
        <h2>Arrears · Creditcoin CC3 · Attestcoin</h2>
        <h1>A real failure. A bonded operator. Turned away.</h1>
        <p className="lede">
          This transaction failed on Ethereum. The account that sent it has{' '}
          <strong>{bonded ? `${bonded} tCTC` : 'a bond'} posted</strong> on Creditcoin. It happened
          inside the covered window, on a covered contract. Arrears refused to touch the bond,
          because the operator never promised to answer for <code>withdraw()</code>.
        </p>
        <p>
          A rule that only ever says yes is not a rule. Start here, not at the payout.
        </p>

        <div className="panel" style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div className="mono" style={{ fontSize: 13 }}>
              Sepolia · block {r.sourceBlock.toLocaleString('en-US')} · WETH.withdraw()
            </div>
            <Live state={live} label={miss ? `confirmed live · miss = ${miss}` : 'confirmed live'} />
          </div>

          <table className="axes">
            <tbody>
              {axes.map((a) => (
                <tr key={a.k} className={a.ok ? '' : 'missed'}>
                  <td className="k">{a.k}</td>
                  <td className="v">{a.v}</td>
                  <td className="n">{a.n}</td>
                  <td className={`m ${a.ok ? 'ok' : 'no'}`}>{a.ok ? 'matches' : 'NOT IN SCOPE'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <div className="mono" style={{ color: 'var(--fail)', fontSize: 13.5, marginBottom: 6 }}>
              {r.error ?? 'OutOfScope(Selector, …)'}
            </div>
            <div className="small">
              Nothing was slashed. Nothing was recorded. The refusal names the one axis that
              missed, so a submitter learns what to change rather than only that something did.
            </div>
          </div>

          <div className="hashes">
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {r.minedTx && <span>ruling <Tx chain="cc3" hash={r.minedTx} /></span>}
              <span>source failure <Tx chain="sepolia" hash={r.sourceTx} /></span>
              <span>operator <Addr chain="sepolia" addr={M.operator.sourceAddress} /></span>
            </div>
          </div>
        </div>

        <p className="small" style={{ marginTop: 18 }}>
          No wallet. No account. Nothing installed. Every figure on this page is either a hash in{' '}
          <code>manifest.json</code> or read live from Creditcoin by your browser.
        </p>
      </div>
    </section>
  );
}
