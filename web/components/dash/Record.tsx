'use client';
import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { M } from '../../lib/manifest';
import { loadOperator, loadClaims, ctc, type OperatorView, type Cov } from '../../lib/dashRead';
import { Panel, Eyebrow } from '../ui/primitives';
import { StatRow } from './Shell';
import { Tx, Addr } from '../Hash';
import { short } from '../../lib/explorer';
import { cn } from '../../lib/cn';

/** An operator's public record. No wallet, ever — this is the observer role, and
 *  it is also what the operator console renders for its own account. */
export function Record({ operatorId, compact }: { operatorId: string; compact?: boolean }) {
  const [v, setV] = useState<OperatorView | null>(null);
  const [claims, setClaims] = useState<Awaited<ReturnType<typeof loadClaims>>>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    loadOperator(operatorId)
      .then(async (o) => {
        if (dead) return;
        setV(o);
        setClaims(await loadClaims(o.claimIds).catch(() => []));
      })
      .catch((e) => setErr(e.shortMessage ?? e.message));
    return () => { dead = true; };
  }, [operatorId]);

  if (err) return <Panel className="p-6"><p className="mono text-[12.5px]" style={{ color: 'var(--miss)' }}>{err}</p></Panel>;
  if (!v) return <Panel className="p-6"><p className="mono text-[12.5px] text-fg-3">reading the registry…</p></Panel>;
  if (!v.registered) {
    return (
      <Panel className="p-6">
        <p className="text-[14.5px] text-fg-2">No operator registered under this id.</p>
        <p className="mono mt-2 break-all text-[11.5px] text-fg-3">{operatorId}</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <Panel className="p-6">
          <Eyebrow>Operator record</Eyebrow>
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <KV k="source address" v={<Addr chain="sepolia" addr={v.sourceAddress} />} />
            <KV k="controller" v={<Addr chain="cc3" addr={v.controller} />} />
            <KV k="chain key" v={`${v.chainKey} · Ethereum Sepolia`} />
            <KV k="operator id" v={<span className="break-all">{short(operatorId, 14, 8)}</span>} />
          </div>
        </Panel>
      )}

      <StatRow accent cells={[
        ['bonded', ctc(v.bonded)],
        ['committed', ctc(v.committed)],
        ['free', ctc(v.free)],
        ['slashed', ctc(v.slashed)],
        ['strikes', String(v.terms.strikes)],
        ['claims', String(v.claimIds.length)],
      ]} />

      <Panel className="p-6">
        <Eyebrow>Credit terms</Eyebrow>
        <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-3">
          <KV k="limit" v={v.lineOpen ? ctc(v.terms.limit) : 'no line open'} />
          <KV k="premium" v={`${v.terms.premiumBps} bps`} />
          <KV k="strikes" v={String(v.terms.strikes)} />
        </div>
        <p className="mt-3 max-w-[70ch] text-[12.5px] leading-relaxed text-fg-3">
          Repriced by the same public rule anyone can evaluate: each proven slashable failure cuts
          the limit multiplicatively and adds to the premium. A pricing rule nobody can check is an
          oracle.
        </p>
      </Panel>

      <Panel className="p-0">
        <div className="border-b border-line-soft px-5 py-3.5">
          <Eyebrow>Coverage · {v.coverages.length}</Eyebrow>
        </div>
        {v.coverages.length === 0
          ? <p className="px-5 py-5 text-[14px] text-fg-3">No coverage declared. The bond answers for nothing until it does.</p>
          : <div className="divide-y divide-line-soft">{v.coverages.map((c) => <CoverageRow key={c.id} c={c} />)}</div>}
      </Panel>

      <Panel className="p-0">
        <div className="border-b border-line-soft px-5 py-3.5"><Eyebrow>Claims on record · {claims.length}</Eyebrow></div>
        {claims.length === 0
          ? <p className="px-5 py-5 text-[14px] text-fg-3">Nothing has been proven against this operator.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr className="border-b border-line">
                  {['verdict', 'source block', 'target · selector', 'gas used / limit', 'slashed', 'beneficiary'].map((h) => (
                    <th key={h} className="mono px-4 pb-2.5 pt-3 text-left text-[10px] uppercase tracking-[0.1em] font-medium text-fg-3">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.claimId} className="border-b border-line-soft last:border-0">
                      <td className="mono px-4 py-3 text-[12px] font-medium"
                        style={{ color: c.verdict === 'OutOfGas' ? 'var(--moved)' : 'var(--kept)' }}>{c.verdict}</td>
                      <td className="mono px-4 py-3 text-[12px] text-fg-2">{c.height.toLocaleString('en-US')} · {c.txIndex}</td>
                      <td className="mono px-4 py-3 text-[12px] text-fg-2">{short(c.target, 8, 4)} · {c.selector}</td>
                      <td className="mono px-4 py-3 text-[12px] text-fg-2">{c.gasUsed.toLocaleString('en-US')} / {c.gasLimit.toLocaleString('en-US')}</td>
                      <td className="mono px-4 py-3 text-[12px]" style={{ color: c.slashed > 0n ? 'var(--moved)' : 'var(--fg-3)' }}>
                        {c.slashed > 0n ? ctc(c.slashed) : '—'}
                      </td>
                      <td className="mono px-4 py-3 text-[12px] text-fg-3">{short(c.beneficiary, 6, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </div>
  );
}

export function CoverageRow({ c, action }: { c: Cov; action?: React.ReactNode }) {
  const live = c.active && Date.now() / 1000 < c.claimDeadline;
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mono flex flex-wrap items-center gap-2 text-[12px]">
            <span className={cn('rounded-pill border px-2 py-0.5 text-[9.5px] uppercase tracking-[0.08em]')}
              style={{ borderColor: live ? 'var(--pass)' : 'var(--away)', color: live ? 'var(--pass)' : 'var(--away)' }}>
              {c.active ? (live ? 'live' : 'expired') : 'revoked'}
            </span>
            <span className="text-fg-3">blocks</span>
            <span className="text-fg">{c.fromHeight.toLocaleString('en-US')} – {c.toHeight.toLocaleString('en-US')}</span>
            {!c.active && (
              <span style={{ color: 'var(--miss)' }}>· revoked from {c.revokedAtHeight.toLocaleString('en-US')}</span>
            )}
          </div>
          <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
            {c.scope.map((s) => (
              <span key={s.target + s.selector}>
                {short(s.target, 8, 4)} · <span className="text-fg-2">{s.selector}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="mono shrink-0 text-right text-[11.5px] text-fg-3">
          <div>committed <span className="text-fg-2">{ctc(c.committed)}</span></div>
          <div>drawn <span className="text-fg-2">{ctc(c.drawn)}</span></div>
          <div>cap <span className="text-fg-2">{ctc(c.perClaimCap)}</span></div>
          <div>payable now <span className="text-fg">{ctc(c.payable)}</span></div>
        </div>
      </div>
      {!c.active && (
        <p className="mt-3 max-w-[74ch] rounded-inner border-l-2 border-line bg-bg py-2 pl-3 text-[12px] leading-relaxed text-fg-3">
          Revoked at block {c.revokedAtHeight.toLocaleString('en-US')}. Failures at or below that
          height <strong className="text-fg-2">remain claimable</strong> until the deadline passes.
          Revocation stops future cover; it never removes past liability.
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="mono w-[104px] shrink-0 text-[10.5px] uppercase tracking-[0.08em] text-fg-3">{k}</span>
      <span className="mono min-w-0 text-[12.5px] text-fg">{v}</span>
    </div>
  );
}

export const DEMO_OPERATOR = M.operator.operatorId;
