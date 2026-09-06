'use client';
import { useEffect, useState } from 'react';
import { M, type GalleryItem } from '../lib/manifest';
import { probeRead } from '../lib/chain';
import { Live } from './Live';
import { Tx, Addr } from './Hash';

/**
 * Seven real Ethereum mainnet failures, 2023–2025, classified by the DEPLOYED VerdictProbe.
 *
 * The probe and the court both call ArrearsVerdict.classify — an `internal` function the
 * compiler inlines into each — so the gallery and the ruling engine contain the same compiled
 * instructions. A gallery that classified more leniently than production is not discouraged,
 * it is not expressible.
 *
 * Rows render instantly from the manifest and verify live in parallel afterwards. A row that
 * cannot reach the chain keeps its recorded values and simply lacks a confirmation mark.
 */
type RowState = { state: 'idle' | 'ok' | 'fail'; verdict?: string; contRoots?: number };

export function Gallery() {
  const items = M.gallery.items;
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    const ac = new AbortController();
    items.forEach((it) => {
      probeRead(3, it.sourceTx, ac.signal)
        .then((r) =>
          setRows((s) => ({ ...s, [it.sourceTx]: {
            state: r.verdict === it.expectedVerdict && r.proofValid ? 'ok' : 'fail',
            verdict: r.verdict, contRoots: r.contRoots } })))
        .catch(() => setRows((s) => ({ ...s, [it.sourceTx]: { state: 'fail' } })));
    });
    return () => ac.abort();
  }, [items]);

  const confirmed = Object.values(rows).filter((r) => r.state === 'ok').length;

  return (
    <section id="gallery">
      <div className="wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
          <h2>Seven real mainnet failures</h2>
          <span className="live"><span className="dot" style={{ background: confirmed === items.length ? 'var(--pass)' : 'var(--line)' }} />
            {confirmed}/{items.length} re-verified in your browser</span>
        </div>
        <h3>The classification, against failures nobody here constructed</h3>
        <p>
          Three years, four separate market events, from the 2023 USDC depeg to the 2025 cascade.
          Each proven through the block-prover precompile and classified by the deployed{' '}
          <Addr chain="cc3" addr={M.contracts.verdictProbe.address} label="VerdictProbe" /> — the
          same <code>ArrearsVerdict</code> library the court rules with, inlined into both.
        </p>
        <p className="note">
          No bond attaches to any of these, because nobody here holds those keys. That is the
          identity binding working, not a gap in the demo: a project that could slash arbitrary
          mainnet addresses on demand would be one that never checked who it was slashing. The
          gallery shows the classification is right at real scale; the Sepolia slash above shows
          the ruling it leads to.
        </p>

        <div className="scroll">
          <table className="rows">
            <thead>
              <tr>
                <th>event</th><th>source transaction</th><th>block</th>
                <th>continuity</th><th>gas used / limit</th><th>verdict</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: GalleryItem) => {
                const r = rows[it.sourceTx] ?? { state: 'idle' as const };
                return (
                  <tr key={it.sourceTx}>
                    <td className="ink">{it.window.replace(/ 20\d\d-\d\d-\d\d$/, '')}</td>
                    <td><Tx chain="mainnet" hash={it.sourceTx} /></td>
                    <td>{it.block.toLocaleString('en-US')}</td>
                    <td>{(r.contRoots ?? it.contRoots).toLocaleString('en-US')} roots</td>
                    <td>{it.expectedGasUsed.toLocaleString('en-US')} / {it.expectedGasLimit.toLocaleString('en-US')}</td>
                    <td className="ink">{r.verdict ?? it.expectedVerdict}</td>
                    <td><Live state={r.state} label="live" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="small" style={{ marginTop: 16 }}>
          All seven are out-of-gas: <code>gasUsed == gasLimit</code> exactly. All seven carry zero
          logs, as every reverted transaction does. Older entries cost more to prove because
          continuity proofs lengthen as attestation checkpoints thin out — 125 roots for October
          2025, 765 for August 2024.
        </p>
      </div>
    </section>
  );
}
