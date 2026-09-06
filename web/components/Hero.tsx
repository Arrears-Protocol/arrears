'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { M } from '../lib/manifest';
import { preview, operatorState, type MissName } from '../lib/chain';
import { Live } from './Live';
import { Tx, Addr } from './Hash';
import { short } from '../lib/explorer';
import { Container, Ambient, Reveal, Eyebrow } from './ui/primitives';
import { FaultStream } from './FaultStream';

/**
 * The site opens on a REFUSAL, not the slash.
 *
 * Shell harvested from proactiv-marketing-template: centred heading over a framed
 * slot below. Their slot holds a scroll-rotated product PNG; ours holds a live
 * component reading CC3, and the 20° rotate is dropped — that is product-screenshot
 * language and would read as gimmick under a data surface.
 *
 * Everything here renders server-side. The live reads only add confirmation.
 */
export function Hero() {
  const r = M.rulings.outOfScope;
  const cov = M.operator.coverages[0];
  const [live, setLive] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [miss, setMiss] = useState<MissName | null>(null);
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
    { k: 'operator', v: short(M.operator.sourceAddress, 12, 4), n: bonded ? `${bonded} tCTC bonded` : 'bonded on Creditcoin', ok: true },
    { k: 'chain', v: 'Ethereum Sepolia', n: 'Attestcoin chain key 1', ok: true },
    { k: 'window', v: `${cov.fromHeight.toLocaleString('en-US')} – ${cov.toHeight.toLocaleString('en-US')}`, n: `block ${r.sourceBlock.toLocaleString('en-US')} is inside`, ok: true },
    { k: 'contract', v: short('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 12, 4), n: 'WETH9 — covered', ok: true },
    { k: 'selector', v: '0x2e1a7d4d', n: 'withdraw(uint256) — in no coverage', ok: false },
  ];

  return (
    <section id="hero" className="relative overflow-hidden pt-20 pb-24 md:pt-28">
      <Ambient />
      <Container className="relative">
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-14">
        <div>
        <Reveal>
          <Eyebrow>A failed transaction is evidence</Eyebrow>
          <h1 className="display mt-5 max-w-[17ch] text-[46px] leading-[1.04] tracking-[-0.02em] md:text-[68px]">
            A real failure.<br />A bonded operator.<br />Turned away.
          </h1>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="mt-7 max-w-[58ch] text-[17px] leading-[1.62] text-fg-2">
            This transaction failed on Ethereum. The account that sent it has{' '}
            <span className="mono text-fg">{bonded ? `${bonded} tCTC` : 'a bond'}</span> posted on
            Creditcoin. It happened inside the covered window, on a covered contract. Arrears
            refused to touch the bond, because the operator never promised to answer for{' '}
            <code className="text-fg">withdraw()</code>.
          </p>
          <p className="mt-4 max-w-[58ch] text-[15px] leading-[1.6] text-fg-3">
            A rule that only ever says yes is not a rule. Start here, not at the payout.
          </p>
        </Reveal>
        </div>

        {/* Empty space, now carrying the thesis. Dropped below lg rather than
            shrunk: at mobile width it would be noise, not explanation. */}
        <Reveal delay={0.12} className="hidden lg:block">
          <FaultStream />
        </Reveal>
        </div>

        {/* The slot proactiv fills with a PNG. Ours holds the live scope card. */}
        <Reveal delay={0.16}>
          <div className="mt-12 rounded-[16px] border border-line bg-bg-raised p-1.5 shadow-[0_1px_0_0_rgb(0_0_0/0.04)]">
            <div className="rounded-[11px] border border-line-soft bg-bg">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
                <div className="mono text-[12.5px] text-fg-2">
                  Sepolia · block <span className="text-fg">{r.sourceBlock.toLocaleString('en-US')}</span> · WETH.withdraw()
                </div>
                <Live state={live} label={miss ? `confirmed live · miss = ${miss}` : 'confirmed live'} />
              </div>

              <table className="w-full">
                <tbody>
                  {axes.map((a) => (
                    <tr
                      key={a.k}
                      className="border-b border-line-soft last:border-0"
                      style={!a.ok ? { background: 'color-mix(in oklab, var(--miss) 7%, transparent)' } : undefined}
                    >
                      <td className="mono w-[92px] py-3 pl-5 pr-2 align-top text-[12.5px] text-fg-3">{a.k}</td>
                      <td className="mono py-3 pr-3 align-top text-[12.5px] text-fg">{a.v}</td>
                      <td className="mono hidden py-3 pr-3 align-top text-[12.5px] text-fg-3 sm:table-cell">{a.n}</td>
                      <td
                        className="mono py-3 pr-5 text-right align-top text-[12px] whitespace-nowrap"
                        style={{ color: a.ok ? 'var(--pass)' : 'var(--miss)', fontWeight: a.ok ? 400 : 600 }}
                      >
                        {a.ok ? 'matches' : 'NOT IN SCOPE'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-line-soft px-5 py-4">
                <div className="mono text-[13px] leading-relaxed break-all" style={{ color: 'var(--miss)' }}>
                  {r.error ?? 'OutOfScope(Selector, …)'}
                </div>
                <p className="mt-2 max-w-[74ch] text-[13.5px] leading-relaxed text-fg-3">
                  Nothing was slashed. Nothing was recorded. The refusal names the one axis that
                  missed, so a submitter learns what to change rather than only that something did.
                </p>
              </div>

              <div className="mono flex flex-wrap gap-x-7 gap-y-2 border-t border-line-soft px-5 py-3.5 text-[12px] text-fg-3">
                {r.minedTx && <span>ruling <Tx chain="cc3" hash={r.minedTx} /></span>}
                <span>source failure <Tx chain="sepolia" hash={r.sourceTx} /></span>
                <span>operator <Addr chain="sepolia" addr={M.operator.sourceAddress} /></span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.24}>
          <p className="mono mt-6 text-[12px] leading-relaxed text-fg-3">
            No wallet. No account. Nothing installed.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
