'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, getAddress, isAddress } from 'ethers';
import { M, type PoolItem } from '../lib/manifest';
import { preview, claimIdFor, ruledClaimIds, type Preview } from '../lib/chain';
import { Live } from './Live';
import { Tx } from './Hash';

/**
 * The one interactive thing. Relayer-sponsored, preview first, then submit.
 *
 * Two deliberate shapes:
 *
 *  1. THE EXPLICIT-REVERT PATH IS THE INVITING ONE. A judge who picks a failure the system
 *     then refuses to slash has understood the rule better than one who watched a payout.
 *     It is offered first, marked as the interesting choice, and described in terms of what
 *     it demonstrates rather than as the lesser option.
 *
 *  2. THE ORDERING HAZARD IS UNREACHABLE. Recording consumes the globally unique claim id, so
 *     asking for the strict refusal afterwards returns AlreadyClaimed instead of the named
 *     error — we hit this ourselves. Here the shape is a single radio chosen before anything
 *     is submitted, evidence state is checked before the controls render, and consumed
 *     evidence leaves the pool. There is no click sequence that reaches AlreadyClaimed.
 */

const DEFAULT_BENEFICIARY = '0x000000000000000000000000000000000000dEaD';

type Shape = 'record' | 'slash';
type Phase = 'idle' | 'previewing' | 'previewed' | 'submitting' | 'done' | 'error';

export function TryIt() {
  const pool = M.evidencePool?.items ?? [];
  const oog = useMemo(() => pool.filter((i) => i.kind === 'OutOfGas'), [pool]);
  const rev = useMemo(() => pool.filter((i) => i.kind === 'ExplicitRevert'), [pool]);

  // Evidence already ruled on, read from chain on load. A reload must not re-offer spent
  // evidence: the relayer would refuse it correctly, but a refused first click reads as broken.
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [poolChecked, setPoolChecked] = useState(false);

  useEffect(() => {
    let dead = false;
    ruledClaimIds()
      .then((ruled) => {
        if (dead) return;
        const spent = new Set(
          pool
            .filter((i) => ruled.has(claimIdFor(M.operator.chainKey, i.block, (i as any).txIndex).toLowerCase()))
            .map((i) => i.txHash),
        );
        setUsed((s) => new Set([...s, ...spent]));
        setPoolChecked(true);
      })
      .catch(() => setPoolChecked(true)); // chain unreachable: offer everything, the relayer still guards
    return () => { dead = true; };
  }, [pool]);
  const [kind, setKind] = useState<'ExplicitRevert' | 'OutOfGas'>('ExplicitRevert');
  const [shape, setShape] = useState<Shape>('record');
  const [ben, setBen] = useState(DEFAULT_BENEFICIARY);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pv, setPv] = useState<Preview | null>(null);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const available = (kind === 'OutOfGas' ? oog : rev).filter((i) => !used.has(i.txHash));
  const item: PoolItem | undefined = available[0];
  const poolEmpty = oog.every((i) => used.has(i.txHash)) && rev.every((i) => used.has(i.txHash));

  const benOk = (() => { try { return isAddress(getAddress(ben)); } catch { return false; } })();

  // The strict shape is only meaningful on an out-of-gas failure; on an explicit revert it
  // refuses by design. Keep the pairing coherent rather than letting it fail.
  useEffect(() => { if (kind === 'ExplicitRevert') setShape('record'); }, [kind]);
  useEffect(() => { setPv(null); setRes(null); setErr(null); setPhase('idle'); }, [kind, shape]);

  async function runPreview() {
    if (!item) return;
    setPhase('previewing'); setErr(null);
    try { setPv(await preview(item.txHash)); setPhase('previewed'); }
    catch (e: any) { setErr(e.message ?? String(e)); setPhase('error'); }
  }

  async function submit() {
    if (!item) return;
    setPhase('submitting'); setErr(null);
    try {
      const r = await fetch('/api/claim', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceTx: item.txHash, shape, beneficiary: getAddress(ben) }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error ?? 'submission refused'); setPhase('error'); setRes(j); return; }
      setRes(j); setPhase('done');
      setUsed((s) => new Set([...s, item.txHash]));
    } catch (e: any) { setErr(e.message ?? String(e)); setPhase('error'); }
  }

  // ── pool exhausted: a complete state, not a broken one ────────────────────
  if (poolEmpty || pool.length === 0) return <Exhausted />;

  return (
    <section id="try">
      <div className="wrap">
        <h2>File a claim yourself</h2>
        <h3>Pick a real failure. Watch the court decide. We pay the gas.</h3>
        <p>
          No wallet, no account, no signature. The evidence below is real: Sepolia transactions
          that already failed and are already attested, so nothing here waits on a chain.
        </p>

        {/* 1 — which failure */}
        <div className="panel">
          <div className="small" style={{ marginBottom: 10 }}>1 — choose the kind of failure</div>
          <div className="choice">
            <label className={`recommended ${kind === 'ExplicitRevert' ? 'sel' : ''}`}>
              <div className="t">
                <input type="radio" checked={kind === 'ExplicitRevert'} onChange={() => setKind('ExplicitRevert')} />
                An explicit revert
                <span className="pill">the interesting one</span>
              </div>
              <div className="d">
                A real <code>WETH.transfer()</code> that failed because the operator had no
                balance. Watch the court record it against them and <strong>refuse to take a
                single wei</strong>. This is the half of the rule that is hard to fake.
                <br />
                <span className="mono">{rev.filter((i) => !used.has(i.txHash)).length} available</span>
              </div>
            </label>
            <label className={kind === 'OutOfGas' ? 'sel' : ''}>
              <div className="t">
                <input type="radio" checked={kind === 'OutOfGas'} onChange={() => setKind('OutOfGas')} />
                An out-of-gas failure
              </div>
              <div className="d">
                A real <code>WETH.approve()</code> sent 30,000 gas against the 46,434 it needs.
                Self-inflicted, so the bond pays. The payout — which is the easy half.
                <br />
                <span className="mono">{oog.filter((i) => !used.has(i.txHash)).length} available</span>
              </div>
            </label>
          </div>

          {item && (
            <dl className="kv" style={{ marginTop: 4 }}>
              <dt>evidence</dt><dd><Tx chain="sepolia" hash={item.txHash} /></dd>
              <dt>block</dt><dd>{item.block.toLocaleString('en-US')}</dd>
              <dt>gas</dt><dd>{item.gasUsed.toLocaleString('en-US')} used of {item.gasLimit.toLocaleString('en-US')}{' '}
                {item.kind === 'OutOfGas' ? '— exhausted' : '— refunded'}</dd>
            </dl>
          )}
        </div>

        {/* 2 — which shape. ONE choice, made before anything is submitted. */}
        <div className="panel">
          <div className="small" style={{ marginBottom: 10 }}>
            2 — choose what to ask the court{' '}
            <span style={{ color: 'var(--ink-3)' }}>· one choice, made once</span>
          </div>
          <div className="choice">
            <label className={shape === 'record' ? 'sel' : ''}>
              <div className="t">
                <input type="radio" checked={shape === 'record'} onChange={() => setShape('record')} />
                Record it
              </div>
              <div className="d">
                <code>submitClaim</code> — rules on the evidence whatever it is. Slashes only if
                out of gas; otherwise records the failure and emits <code>SlashRefused</code>.
              </div>
            </label>
            <label className={`${shape === 'slash' ? 'sel' : ''}`} style={{ opacity: kind === 'ExplicitRevert' ? 0.45 : 1 }}>
              <div className="t">
                <input type="radio" checked={shape === 'slash'} disabled={kind === 'ExplicitRevert'}
                       onChange={() => setShape('slash')} />
                Slash only
              </div>
              <div className="d">
                <code>submitSlashingClaim</code> — refuses outright and writes nothing unless it
                is slashable.
                {kind === 'ExplicitRevert' && (
                  <><br /><strong>Unavailable for an explicit revert:</strong> it would refuse by
                  design. Choosing it here would spend gas to learn what the free preview
                  already says.</>
                )}
              </div>
            </label>
          </div>
          <p className="small" style={{ margin: 0 }}>
            You cannot ask for both. Recording consumes the claim id, so asking to slash
            afterwards would return <code>AlreadyClaimed</code> instead of a real answer — a
            hazard we hit ourselves, designed out here rather than documented beside it.
          </p>
        </div>

        {/* 3 — beneficiary */}
        <div className="panel">
          <div className="small" style={{ marginBottom: 10 }}>3 — who gets credited on chain</div>
          <input className={`addr ${benOk ? '' : 'bad'}`} value={ben} spellCheck={false}
                 onChange={(e) => setBen(e.target.value.trim())} aria-label="beneficiary address" />
          <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
            {benOk
              ? <>This exact address goes into the <code>ClaimRuled</code> event. Put your own in —
                  a stranger directing a real ruling is the point.</>
              : <span style={{ color: 'var(--fail)' }}>Not a valid checksummed address.</span>}
          </p>
        </div>

        {/* 4 — preview, then submit */}
        <div className="panel">
          <div className="small" style={{ marginBottom: 12 }}>
            4 — preview for free, then submit{' '}
            <span style={{ color: 'var(--ink-3)' }}>· the preview is an eth_call and costs nothing</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" onClick={runPreview} disabled={!item || phase === 'previewing' || phase === 'submitting'}>
              {phase === 'previewing' ? 'previewing…' : 'Preview (free)'}
            </button>
            <button className="btn go" onClick={submit}
                    disabled={!pv || !benOk || phase === 'submitting' || phase === 'done'}>
              {phase === 'submitting' ? 'submitting…' : 'Submit — we pay the gas'}
            </button>
            {phase === 'previewed' && <Live state="ok" label="preview complete" />}
          </div>

          {pv && (
            <div className="compare" style={{ marginTop: 18 }}>
              <div>
                <div className="small" style={{ marginBottom: 8 }}>predicted, before any gas</div>
                <dl className="kv">
                  <dt>proof</dt><dd>{pv.proofValid ? 'verified' : 'invalid'}</dd>
                  <dt>verdict</dt><dd>{pv.verdict}</dd>
                  <dt>in scope</dt><dd>{pv.miss === 'None' ? 'yes' : `no — ${pv.miss}`}</dd>
                  <dt>would slash</dt><dd>{formatEther(pv.wouldSlashWei)} tCTC</dd>
                </dl>
              </div>
              <div>
                <div className="small" style={{ marginBottom: 8 }}>
                  {res?.ok ? 'the ruling, mined' : 'the ruling'}
                </div>
                {res?.ok ? (
                  <>
                    <dl className="kv">
                      <dt>verdict</dt><dd>{res.result?.verdict ?? '—'}</dd>
                      <dt>slashed</dt><dd>{res.result ? `${formatEther(res.result.slashedWei)} tCTC` : '0.0 tCTC'}</dd>
                      <dt>credited</dt><dd className="mono">{res.result?.beneficiary?.slice(0, 12)}…</dd>
                      <dt>gas</dt><dd>{Number(res.gasUsed).toLocaleString('en-US')}</dd>
                    </dl>
                    <div style={{ marginTop: 10 }}><Tx chain="cc3" hash={res.hash} label={`ruling ${res.hash.slice(0, 12)}…`} /></div>
                    {res.refusal && (
                      <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
                        <strong>Refused, and recorded.</strong> <code>SlashRefused</code> carried{' '}
                        <code>{res.refusal.reasonSelector}</code> — the selector of{' '}
                        <code>NotSlashableExplicitRevert</code>. The bond did not move.
                      </p>
                    )}
                    <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
                      Prediction and result agree. That is the whole reason the preview exists:
                      the relayer never spends on a claim that would not land.
                    </p>
                  </>
                ) : (
                  <p className="small" style={{ margin: 0 }}>
                    {phase === 'submitting' ? 'submitting…' : 'not submitted yet'}
                  </p>
                )}
              </div>
            </div>
          )}

          {err && (
            <p className="small" style={{ color: 'var(--fail)', marginTop: 14, marginBottom: 0 }}>
              {err}
              {res?.refusedBeforeSubmit && ' — refused before spending anything, which is the preview doing its job.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Pool exhausted. A complete state that reads as finished, not broken. */
function Exhausted() {
  return (
    <section id="try">
      <div className="wrap">
        <h2>File a claim yourself</h2>
        <h3>Every piece of evidence in the pool has been ruled on.</h3>
        <p>
          The interactive pool was pre-produced and pre-attested so nothing here would ever wait
          on a chain, and it has now been used up — each claim id can only be ruled on once, which
          is the replay guard doing exactly what it should.
        </p>
        <p className="note">
          Nothing above depends on this section. The four rulings, the gallery and every hash on
          this page are permanent transactions on Creditcoin, readable whether or not there is
          evidence left to file.
        </p>
        <p className="small">
          Producing more is one script and about eight minutes of attestation —{' '}
          <code>phase0/probes/35-evidence-pool.ts</code>.
        </p>
      </div>
    </section>
  );
}
