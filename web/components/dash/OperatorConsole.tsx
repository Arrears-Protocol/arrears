'use client';
import { useEffect, useState } from 'react';
import { formatEther, getAddress, isAddress, parseEther } from 'ethers';
import { M } from '../../lib/manifest';
import { loadOperator, ctc, registryRead, type OperatorView, type Cov } from '../../lib/dashRead';
import { Panel, Eyebrow, SectionHead } from '../ui/primitives';
import { useWallet, NeedsWallet } from './Wallet';
import { registryWrite, CC3 } from '../../lib/wallet';
import { Record, CoverageRow } from './Record';
import { Tx } from '../Hash';
import { short } from '../../lib/explorer';
import { cn } from '../../lib/cn';

const btn = 'mono rounded-inner border border-line bg-bg-raised px-4 py-2 text-[12.5px] hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-40';
const btnGo = 'mono rounded-inner border border-line bg-fg px-4 py-2 text-[12.5px] text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const input = 'mono w-full rounded-inner border border-line bg-bg px-3 py-2.5 text-[12.5px] text-fg outline-none focus:border-fg-3';

export function OperatorConsole() {
  const w = useWallet();
  const [opId, setOpId] = useState<string | null>(null);
  const [v, setV] = useState<OperatorView | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolve the connected controller to an operator id by scanning the demo
  // operator first — there is no enumerable operator list on chain, which is a
  // real gap and is stated rather than papered over.
  useEffect(() => {
    if (!w.address) { setOpId(null); setV(null); return; }
    let dead = false;
    (async () => {
      const candidate = M.operator.operatorId;
      const o = await loadOperator(candidate).catch(() => null);
      if (dead) return;
      if (o?.registered && getAddress(o.controller) === getAddress(w.address!)) { setOpId(candidate); setV(o); }
      else { setOpId(null); setV(null); }
    })();
    return () => { dead = true; };
  }, [w.address, tx]);

  async function run(label: string, fn: () => Promise<any>) {
    setErr(null); setBusy(true); setTx(null);
    try { const rc = await (await fn()).wait(); setTx(rc.hash); }
    catch (e: any) { setErr(`${label}: ${e.shortMessage ?? e.message ?? String(e)}`); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Operator" title={<>Your bond, your promises, your record.</>}>
        Deposit a bond, declare what it answers for, and see what has been proven against you.
        Everything below reads without a wallet; only the actions need one.
      </SectionHead>

      <NeedsWallet what="Acting as an operator">
        {!opId || !v ? (
          <Panel className="p-6">
            <Eyebrow>No operator for this account</Eyebrow>
            <p className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-fg-2">
              The connected account <span className="mono text-fg">{short(w.address ?? '', 8, 6)}</span>{' '}
              does not control a registered operator. Register one first — that is the two-step
              identity binding, and it is the most important screen here.
            </p>
            <a href="/dashboard/operator/register" className={cn(btnGo, 'mt-4 inline-block')}>register an operator →</a>
            <p className="mt-4 max-w-[68ch] text-[12.5px] leading-relaxed text-fg-3">
              There is no enumerable operator list on chain — <code>claimsAgainst</code> and{' '}
              <code>operator</code> both need an id you already hold. This console therefore
              resolves the connected account against known operators rather than scanning. A real
              deployment would want an indexer.
            </p>
          </Panel>
        ) : (
          <>
            <Record operatorId={opId} compact />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-6">
                <Eyebrow>Deposit bond</Eyebrow>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-3">
                  Permissionless — anyone may bond on an operator&apos;s behalf, since
                  over-collateralising someone else harms nobody.
                </p>
                <Amount label="amount" onSubmit={(amt) => run('postBond', async () =>
                  (await registryWrite()).postBond(opId, { value: parseEther(amt) }))} busy={busy} cta="deposit" />
              </Panel>

              <Panel className="p-6">
                <Eyebrow>Withdraw</Eyebrow>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-3">
                  Only free bond can be requested, and it waits out the unbonding period. Evidence
                  is historical: an operator who could withdraw the instant bad news appeared would
                  never be slashable.
                </p>
                <div className="mono mt-3 text-[12px] text-fg-3">
                  free <span className="text-fg">{ctc(v.free)}</span>
                  {v.withdrawableAt > 0 && (
                    <> · unlocks {new Date(v.withdrawableAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}</>
                  )}
                </div>
                <Amount label="amount to request" cta="request withdrawal" busy={busy}
                  onSubmit={(amt) => run('requestWithdrawal', async () =>
                    (await registryWrite()).requestWithdrawal(opId, parseEther(amt)))} />
                <button className={cn(btn, 'mt-2 w-full')} disabled={busy || v.withdrawableAt === 0 || Date.now() / 1000 < v.withdrawableAt}
                  onClick={() => run('withdrawBond', async () => (await registryWrite()).withdrawBond(opId, w.address!))}>
                  complete withdrawal
                </button>
              </Panel>
            </div>

            <DeclareCoverage operatorId={opId} v={v} busy={busy} run={run} />

            <Panel className="p-0">
              <div className="border-b border-line-soft px-5 py-3.5"><Eyebrow>Revoke coverage</Eyebrow></div>
              {v.coverages.filter((c) => c.active).length === 0
                ? <p className="px-5 py-5 text-[14px] text-fg-3">No live coverage to revoke.</p>
                : <div className="divide-y divide-line-soft">
                    {v.coverages.filter((c) => c.active).map((c) => (
                      <RevokeRow key={c.id} c={c} busy={busy} run={run} />
                    ))}
                  </div>}
            </Panel>

            {tx && (
              <Panel className="p-4">
                <div className="mono text-[12px]" style={{ color: 'var(--pass)' }}>
                  confirmed · <Tx chain="cc3" hash={tx} />
                </div>
              </Panel>
            )}
            {err && <Panel className="p-4"><p className="mono text-[12px] leading-relaxed" style={{ color: 'var(--miss)' }}>{err}</p></Panel>}
          </>
        )}
      </NeedsWallet>
    </div>
  );
}

function Amount({ label, cta, busy, onSubmit }: { label: string; cta: string; busy: boolean; onSubmit: (v: string) => void }) {
  const [v, setV] = useState('');
  const ok = /^\d*\.?\d+$/.test(v) && parseFloat(v) > 0;
  return (
    <div className="mt-3">
      <label className="mono text-[10.5px] uppercase tracking-[0.09em] text-fg-3">{label} · tCTC</label>
      <div className="mt-1.5 flex gap-2">
        <input className={input} value={v} onChange={(e) => setV(e.target.value.trim())} placeholder="0.0" />
        <button className={btnGo} disabled={!ok || busy} onClick={() => onSubmit(v)}>{cta}</button>
      </div>
    </div>
  );
}

/** Revocation, with the client-side preview of exactly what it would stop covering. */
function RevokeRow({ c, busy, run }: { c: Cov; busy: boolean; run: (l: string, f: () => Promise<any>) => void }) {
  const [at, setAt] = useState(String(c.toHeight));
  const h = Number(at) || 0;
  const clamped = Math.min(Math.max(h, c.fromHeight), c.toHeight);
  const stillCovered = Math.max(0, clamped - c.fromHeight + 1);
  const stopsCovering = Math.max(0, c.toHeight - clamped);

  return (
    <div className="px-5 py-4">
      <CoverageRow c={c} />
      <div className="mt-3 rounded-inner border border-line bg-bg p-4">
        <label className="mono text-[10.5px] uppercase tracking-[0.09em] text-fg-3">revoke from source-chain height</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input className={cn(input, 'max-w-[220px]')} value={at} onChange={(e) => setAt(e.target.value.trim())} />
          <button className={btn} disabled={busy}
            onClick={() => run('revokeCoverage', async () => (await registryWrite()).revokeCoverage(c.id, clamped))}>
            revoke
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-inner border p-3" style={{ borderColor: 'var(--miss)' }}>
            <div className="mono text-[10px] uppercase tracking-[0.09em]" style={{ color: 'var(--miss)' }}>
              still liable — never removed
            </div>
            <div className="mono mt-1.5 text-[15px] text-fg">{stillCovered.toLocaleString('en-US')} blocks</div>
            <div className="mono text-[11px] text-fg-3">
              {c.fromHeight.toLocaleString('en-US')} – {clamped.toLocaleString('en-US')}
            </div>
          </div>
          <div className="rounded-inner border border-line p-3">
            <div className="mono text-[10px] uppercase tracking-[0.09em] text-fg-3">stops covering</div>
            <div className="mono mt-1.5 text-[15px] text-fg-2">{stopsCovering.toLocaleString('en-US')} blocks</div>
            <div className="mono text-[11px] text-fg-3">
              {(clamped + 1).toLocaleString('en-US')} – {c.toHeight.toLocaleString('en-US')}
            </div>
          </div>
        </div>

        <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-fg-2">
          <strong className="text-fg">Revocation stops future cover. It never removes past
          liability.</strong> Every failure at or below block {clamped.toLocaleString('en-US')}{' '}
          stays claimable until the deadline passes, whatever you do here. An operator who could
          revoke their way out of a pending claim would make the bond decorative.
        </p>
        {h !== clamped && (
          <p className="mono mt-2 text-[11.5px]" style={{ color: 'var(--miss)' }}>
            {h.toLocaleString('en-US')} is outside the window and will be clamped to {clamped.toLocaleString('en-US')}.
          </p>
        )}
      </div>
    </div>
  );
}

function DeclareCoverage({ operatorId, v, busy, run }: {
  operatorId: string; v: OperatorView; busy: boolean; run: (l: string, f: () => Promise<any>) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [committed, setCommitted] = useState('');
  const [cap, setCap] = useState('');
  const [days, setDays] = useState('365');
  const [pairs, setPairs] = useState<Array<{ target: string; selector: string }>>([{ target: '', selector: '' }]);
  const [minChallenge, setMinChallenge] = useState<number>(86400);

  useEffect(() => { registryRead().minChallengePeriod().then((x: bigint) => setMinChallenge(Number(x))).catch(() => {}); }, []);

  const pairsOk = pairs.length > 0 && pairs.every((p) => {
    try { return isAddress(getAddress(p.target)) && /^0x[0-9a-fA-F]{8}$/.test(p.selector); } catch { return false; }
  });
  const nums = [from, to, committed, cap].every((x) => x !== '' && !Number.isNaN(Number(x)));
  const windowOk = Number(to) >= Number(from);
  const capOk = nums && parseFloat(cap) > 0 && parseFloat(committed) >= parseFloat(cap);
  const fundsOk = nums && parseEther(committed || '0') <= v.free;
  const deadlineOk = Number(days) * 86400 >= minChallenge;
  const ok = pairsOk && nums && windowOk && capOk && fundsOk && deadlineOk;

  return (
    <Panel className="p-6">
      <Eyebrow>Declare coverage</Eyebrow>
      <p className="mt-2 max-w-[74ch] text-[13px] leading-relaxed text-fg-3">
        A scoped promise: these contracts, these selectors, these blocks. The bond answers for
        failures inside it and refuses everything else with <code>OutOfScope</code>, naming the
        axis that missed. The window may be set entirely in the past — Attestcoin&apos;s provable
        floor for Ethereum is block 0.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Num label="from height" v={from} set={setFrom} />
        <Num label="to height" v={to} set={setTo} />
        <Num label="committed · tCTC" v={committed} set={setCommitted} hint={`free ${ctc(v.free)}`} />
        <Num label="per-claim cap · tCTC" v={cap} set={setCap} hint="ceiling on one slash" />
      </div>

      <div className="mt-3">
        <label className="mono text-[10.5px] uppercase tracking-[0.09em] text-fg-3">scope · (contract, selector) pairs</label>
        <div className="mt-1.5 space-y-2">
          {pairs.map((p, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input className={cn(input, 'flex-1 min-w-[240px]')} placeholder="0x… contract" value={p.target}
                onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, target: e.target.value.trim() } : x))} />
              <input className={cn(input, 'w-[140px]')} placeholder="0xd0e30db0" value={p.selector}
                onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, selector: e.target.value.trim() } : x))} />
              <button className={btn} onClick={() => setPairs(pairs.filter((_, j) => j !== i))} disabled={pairs.length === 1}>−</button>
            </div>
          ))}
        </div>
        <button className={cn(btn, 'mt-2')} onClick={() => setPairs([...pairs, { target: '', selector: '' }])}>add pair</button>
        <p className="mt-2 max-w-[70ch] text-[11.5px] leading-relaxed text-fg-3">
          Both halves are required. A selector alone would cover every contract sharing a 4-byte
          prefix — the same class of mistake as matching an event by signature without checking
          its emitter.
        </p>
      </div>

      <div className="mt-3 max-w-[240px]">
        <Num label="claim deadline · days from now" v={days} set={setDays}
          hint={`minimum ${Math.round(minChallenge / 86400)} day(s)`} />
      </div>

      <button className={cn(btnGo, 'mt-4')} disabled={!ok || busy}
        onClick={() => run('declareCoverage', async () => (await registryWrite()).declareCoverage(
          operatorId, M.operator.chainKey, Number(from), Number(to),
          parseEther(committed), parseEther(cap),
          Math.floor(Date.now() / 1000) + Number(days) * 86400,
          pairs.map((p) => ({ target: getAddress(p.target), selector: p.selector })),
        ))}>
        declare coverage
      </button>
      {!ok && (from || committed) && (
        <p className="mono mt-2 text-[11.5px]" style={{ color: 'var(--miss)' }}>
          {!windowOk ? 'window is inverted'
            : !pairsOk ? 'every pair needs a contract address and a 4-byte selector'
            : !capOk ? 'per-claim cap must be positive and no larger than the commitment'
            : !fundsOk ? `not enough free bond — you have ${ctc(v.free)}`
            : !deadlineOk ? 'deadline is shorter than the minimum challenge period'
            : 'incomplete'}
        </p>
      )}
    </Panel>
  );
}

function Num({ label, v, set, hint }: { label: string; v: string; set: (s: string) => void; hint?: string }) {
  return (
    <div>
      <label className="mono text-[10.5px] uppercase tracking-[0.09em] text-fg-3">{label}</label>
      <input className={cn(input, 'mt-1.5')} value={v} onChange={(e) => set(e.target.value.trim())} />
      {hint && <p className="mono mt-1 text-[10.5px] text-fg-3">{hint}</p>}
    </div>
  );
}
