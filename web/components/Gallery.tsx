'use client';
import { useEffect, useState } from 'react';
import { M, type GalleryItem } from '../lib/manifest';
import { probeRead } from '../lib/chain';
import { Live } from './Live';
import { Tx, Addr } from './Hash';
import { Container, Reveal, SectionHead, Panel } from './ui/primitives';

/**
 * Seven real mainnet failures, classified by the DEPLOYED VerdictProbe.
 *
 * Shell harvested from nodus's `security` section — a bordered container with a
 * header strip over a bordered body. Their body holds three feature cards; ours
 * holds a seven-row data table. That swap is the whole idea: the polish of the
 * shell wrapping real evidence.
 *
 * Rows render from the manifest instantly and verify live in parallel. A row that
 * cannot reach the chain keeps its recorded values and simply lacks a mark.
 */
type RowState = { state: 'idle' | 'ok' | 'fail'; verdict?: string; contRoots?: number };

export function Gallery() {
  const items = M.gallery.items;
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    const ac = new AbortController();
    items.forEach((it) => {
      probeRead(3, it.sourceTx, ac.signal)
        .then((r) => setRows((s) => ({ ...s, [it.sourceTx]: {
          state: r.verdict === it.expectedVerdict && r.proofValid ? 'ok' : 'fail',
          verdict: r.verdict, contRoots: r.contRoots } })))
        .catch(() => setRows((s) => ({ ...s, [it.sourceTx]: { state: 'fail' } })));
    });
    return () => ac.abort();
  }, [items]);

  const confirmed = Object.values(rows).filter((r) => r.state === 'ok').length;

  return (
    <section id="gallery" className="py-24">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="The evidence gallery"
            title={<>Seven real mainnet failures, three years apart.</>}
            right={
              <span className="mono inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.11em] text-fg-3">
                <span className="h-[5px] w-[5px] rounded-full"
                  style={{ background: confirmed === items.length ? 'var(--pass)' : 'var(--line)' }} />
                {confirmed}/{items.length} re-verified in your browser
              </span>
            }
          >
            From the 2023 USDC depeg to the 2025 cascade, each proven through the block-prover
            precompile and classified by the deployed{' '}
            <Addr chain="cc3" addr={M.contracts.verdictProbe.address} label="VerdictProbe" /> — the
            same <code className="text-fg">ArrearsVerdict</code> library the court rules with,
            inlined into both.
          </SectionHead>
        </Reveal>

        <Reveal delay={0.08}>
          <Panel className="overflow-hidden p-0">
            <div className="border-b border-line-soft bg-bg-sunken px-5 py-3">
              <p className="max-w-[92ch] text-[13px] leading-relaxed text-fg-3">
                No bond attaches to any of these, because nobody here holds those keys. That is the
                identity binding working, not a gap: a project that could slash arbitrary mainnet
                addresses would be one that never checked who it was slashing.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-line">
                    {['event', 'source transaction', 'block', 'continuity', 'gas used / limit', 'verdict', ''].map((h) => (
                      <th key={h} className="mono px-4 pb-2.5 pt-3.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-fg-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: GalleryItem) => {
                    const r = rows[it.sourceTx] ?? { state: 'idle' as const };
                    return (
                      <tr key={it.sourceTx} className="border-b border-line-soft transition-colors last:border-0 hover:bg-bg-sunken">
                        <td className="px-4 py-3 text-[13px] text-fg">{it.window.replace(/ 20\d\d-\d\d-\d\d$/, '')}</td>
                        <td className="mono px-4 py-3 text-[12px]"><Tx chain="mainnet" hash={it.sourceTx} /></td>
                        <td className="mono px-4 py-3 text-[12px] text-fg-2">{it.block.toLocaleString('en-US')}</td>
                        <td className="mono px-4 py-3 text-[12px] text-fg-2">{(r.contRoots ?? it.contRoots).toLocaleString('en-US')} roots</td>
                        <td className="mono px-4 py-3 text-[12px] text-fg-2">
                          {it.expectedGasUsed.toLocaleString('en-US')} / {it.expectedGasLimit.toLocaleString('en-US')}
                        </td>
                        <td className="mono px-4 py-3 text-[12px] font-medium" style={{ color: 'var(--moved)' }}>
                          {r.verdict ?? it.expectedVerdict}
                        </td>
                        <td className="px-4 py-3"><Live state={r.state} label="live" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-line-soft px-5 py-3.5">
              <p className="max-w-[92ch] text-[12.5px] leading-relaxed text-fg-3">
                All seven are out of gas: <span className="mono text-fg-2">gasUsed == gasLimit</span>{' '}
                exactly. All seven carry zero logs. Older entries cost more to prove because
                continuity proofs lengthen as attestation checkpoints thin out — 125 roots for
                October 2025, 765 for August 2024.
              </p>
            </div>
          </Panel>
        </Reveal>
      </Container>
    </section>
  );
}
