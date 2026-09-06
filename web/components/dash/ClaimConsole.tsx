'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, getAddress, isAddress } from 'ethers';
import { M } from '../../lib/manifest';
import { preview, claimIdFor, ruledClaimIds, fetchProof, type Preview } from '../../lib/chain';
import { Panel, Eyebrow, SectionHead } from '../ui/primitives';
import { useWallet, NeedsWallet, GasBanner } from './Wallet';
import { courtWrite } from '../../lib/wallet';
import { Tx } from '../Hash';
import { cn } from '../../lib/cn';

const btn = 'mono rounded-inner border border-line bg-bg-raised px-4 py-2 text-[12.5px] hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-40';
const btnGo = 'mono rounded-inner border border-line bg-fg px-4 py-2 text-[12.5px] text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * The claimant role. Self-funded here — the sponsored path stays on the landing
 * page so a judge can rule without a wallet.
 *
 * The two ordering constraints are enforced in the interface, not documented
 * beside it: the submission shape is one choice made before anything is sent, and
 * already-ruled evidence never appears in the list.
 */
export function ClaimConsole() {
  const w = useWallet();
  const pool = M.evidencePool?.items ?? [];
  const [spent, setSpent] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [shape, setShape] = useState<'record' | 'slash'>('record');
  const [ben, setBen] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (w.address && !ben) setBen(w.address); }, [w.address, ben]);

  // Already-ruled evidence is filtered out on load. One RPC call, not one per item.
  useEffect(() => {
    ruledClaimIds()
      .then((ruled) => {
        setSpent(new Set(pool
          .filter((i) => ruled.has(claimIdFor(M.operator.chainKey, i.block, (i as any).txIndex).toLowerCase()))
          .map((i) => i.txHash)));
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [pool]);

  const available = useMemo(() => pool.filter((i) => !spent.has(i.txHash)), [pool, spent]);
  const item = available.find((i) => i.txHash === sel) ?? null;
  const benOk = (() => { try { return isAddress(getAddress(ben)); } catch { return false; } })();

  // An explicit revert is refused by the strict path by design; keep the pairing
  // coherent rather than letting someone pay gas to learn that.
  useEffect(() => { if (item?.kind === 'ExplicitRevert') setShape('record'); }, [item?.kind]);
  useEffect(() => { setPv(null); setTx(null); setErr(null); }, [sel, shape]);

  async function doPreview() {
    if (!item) return;
    setBusy(true); setErr(null);
    try { setPv(await preview(item.txHash)); }
    catch (e: any) { setErr(e.shortMessage ?? e.message); }
    setBusy(false);
  }

  async function submit() {
    if (!item || !pv) return;
    setBusy(true); setErr(null);
    try {
      const p = await fetchProof(M.operator.chainKey, item.txHash);
      const c = await courtWrite();
      const fn = shape === 'slash' ? 'submitSlashingClaim' : 'submitClaim';
      const t = await c[fn](M.operator.operatorId, p.headerNumber, p.txBytes, p.mp, p.cp, getAddress(ben), { gasLimit: 3_000_000 });
      const rc = await t.wait();
      setTx(rc.hash);
      setSpent((s) => new Set([...s, item.txHash]));
    } catch (e: any) { setErr(e.shortMessage ?? e.message ?? String(e)); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Claimant" title={<>Bring evidence. The court decides.</>}>
        Pick a real failure, choose what to ask, preview for free, then submit. Here you pay your
        own gas — the sponsored path stays on the landing page so a judge can rule without a wallet.
      </SectionHead>

      <Panel className="p-5">
        <p className="max-w-[74ch] text-[13.5px] leading-relaxed text-fg-2">
          <strong className="text-fg">Connecting gets your address into the ruling, and nothing
          else.</strong> There is no claimant bounty in these contracts and none is implied: a
          reward would make <code>beneficiary</code> a value whoever pays the gas could redirect.
          That is a real weakness of unrewarded fraud proofs — nobody is paid to go looking — and
          it is a deliberate one.
        </p>
      </Panel>

      <Panel className="p-6">
        <Eyebrow>1 — evidence · {available.length} unruled</Eyebrow>
        {!checked
          ? <p className="mono mt-3 text-[12px] text-fg-3">checking which evidence has already been ruled on…</p>
          : available.length === 0
            ? <p className="mt-3 text-[14px] text-fg-3">
                Every piece of pooled evidence has been ruled on. Each claim id can be ruled once —
                the replay guard doing its job.
              </p>
            : (
              <div className="mt-3 max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {available.map((i) => (
                  <button key={i.txHash} onClick={() => setSel(i.txHash)}
                    className={cn('block w-full rounded-inner border p-3 text-left transition-colors hover:border-fg-3',
                      sel === i.txHash ? 'border-fg-3 bg-bg-sunken' : 'border-line bg-bg')}>
                    <div className="mono flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                      <span style={{ color: i.kind === 'OutOfGas' ? 'var(--moved)' : 'var(--kept)' }}>{i.kind}</span>
                      <span className="text-fg-3">block {i.block.toLocaleString('en-US')}</span>
                    </div>
                    <div className="mono mt-1 truncate text-[11px] text-fg-3">{i.txHash}</div>
                    <div className="mono mt-1 text-[11px] text-fg-3">
                      {i.selectorName} · gas {i.gasUsed.toLocaleString('en-US')} / {i.gasLimit.toLocaleString('en-US')}
                    </div>
                  </button>
                ))}
              </div>
            )}
      </Panel>

      <Panel className={cn('p-6', !item && 'opacity-45')}>
        <Eyebrow>2 — what to ask · one choice, made once</Eyebrow>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className={cn('block cursor-pointer rounded-inner border bg-bg p-4', shape === 'record' ? 'border-fg-3' : 'border-line')}>
            <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-fg">
              <input type="radio" checked={shape === 'record'} onChange={() => setShape('record')} disabled={!item} />
              Record it
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-3">
              <code>submitClaim</code> — rules whatever the evidence is. Slashes only if out of gas;
              otherwise records it and emits <code>SlashRefused</code>.
            </p>
          </label>
          <label className={cn('block rounded-inner border bg-bg p-4',
            shape === 'slash' ? 'border-fg-3' : 'border-line',
            item?.kind === 'ExplicitRevert' ? 'cursor-not-allowed opacity-45' : 'cursor-pointer')}>
            <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-fg">
              <input type="radio" checked={shape === 'slash'} disabled={!item || item.kind === 'ExplicitRevert'}
                onChange={() => setShape('slash')} />
              Slash only
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-3">
              <code>submitSlashingClaim</code> — refuses outright and writes nothing unless it is
              slashable.
              {item?.kind === 'ExplicitRevert' && (
                <><br /><strong className="text-fg-2">Unavailable for an explicit revert:</strong> it
                would refuse by design.</>
              )}
            </p>
          </label>
        </div>
        <p className="mt-3 max-w-[74ch] text-[12px] leading-relaxed text-fg-3">
          You cannot ask for both. Recording consumes the claim id, so asking to slash afterwards
          would return <code>AlreadyClaimed</code> instead of a real answer.
        </p>
      </Panel>

      <GasBanner what="Submitting a claim yourself" />

      <NeedsWallet what="Submitting a claim">
        <Panel className="p-6">
          <Eyebrow>3 — beneficiary and submission</Eyebrow>
          <input value={ben} onChange={(e) => setBen(e.target.value.trim())} spellCheck={false}
            className={cn('mono mt-3 w-full rounded-inner border bg-bg px-3 py-2.5 text-[12.5px] text-fg outline-none focus:border-fg-3',
              benOk ? 'border-line' : 'border-miss')} />
          <p className="mt-1.5 text-[12px] text-fg-3">
            {benOk ? 'This exact address goes into the ClaimRuled event.' : 'Not a valid checksummed address.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button className={btn} onClick={doPreview} disabled={!item || busy}>
              {busy && !pv ? 'previewing…' : 'preview — free'}
            </button>
            <button className={btnGo} onClick={submit} disabled={!pv || !benOk || busy || !!tx}>
              {busy && pv ? 'submitting…' : 'submit · you pay the gas'}
            </button>
          </div>

          {pv && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-inner border border-line bg-bg p-4">
                <div className="mono text-[10px] uppercase tracking-[0.1em] text-fg-3">predicted, before any gas</div>
                <dl className="mono mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                  <dt className="text-fg-3">proof</dt><dd>{pv.proofValid ? 'verified' : 'invalid'}</dd>
                  <dt className="text-fg-3">verdict</dt><dd>{pv.verdict}</dd>
                  <dt className="text-fg-3">in scope</dt><dd>{pv.miss === 'None' ? 'yes' : `no — ${pv.miss}`}</dd>
                  <dt className="text-fg-3">would slash</dt><dd>{formatEther(pv.wouldSlashWei)} tCTC</dd>
                </dl>
              </div>
              <div className="rounded-inner border border-line bg-bg p-4">
                <div className="mono text-[10px] uppercase tracking-[0.1em] text-fg-3">the ruling</div>
                {tx
                  ? <div className="mono mt-2 text-[12px]" style={{ color: 'var(--pass)' }}>mined · <Tx chain="cc3" hash={tx} /></div>
                  : <p className="mono mt-2 text-[12px] text-fg-3">not submitted yet</p>}
              </div>
            </div>
          )}
          {err && <p className="mono mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--miss)' }}>{err}</p>}
        </Panel>
      </NeedsWallet>
    </div>
  );
}
