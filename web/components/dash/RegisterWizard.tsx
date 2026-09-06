'use client';
import { useEffect, useState } from 'react';
import { Contract, JsonRpcProvider, getAddress, isAddress } from 'ethers';
import { M } from '../../lib/manifest';
import { Panel, Eyebrow } from '../ui/primitives';
import { useWallet, ConnectButton } from './Wallet';
import { CC3, REGISTRY_ABI, innerDigest, prefixed, signInner, registryWrite } from '../../lib/wallet';
import { short } from '../../lib/explorer';
import { Tx, Addr } from '../Hash';
import { cn } from '../../lib/cn';

/**
 * The identity binding, made the most legible screen in the product.
 *
 * Two wallets and two steps, and neither is hidden. The Ethereum key signs; the
 * Creditcoin controller submits. That is unavoidable, because the bond lives on
 * Creditcoin while the evidence names an Ethereum address, and nothing in an
 * Attestcoin proof connects them.
 *
 * It is also the one thing the precompile does not verify — so rather than
 * dressing it as a formality, the screen names what each step proves, shows the
 * exact bytes being signed, and checks them against the contract's own
 * `registrationDigest` before asking anyone to sign anything.
 *
 * This is where a reader sees why Arrears cannot slash an address nobody
 * controls. Showing it is the same move as leading with the refusal.
 */

const read = () =>
  new Contract(M.contracts.arrearsRegistry.address, REGISTRY_ABI,
    new JsonRpcProvider(CC3.rpc, undefined, { staticNetwork: true }));

type Step = 1 | 2 | 3;

export function RegisterWizard() {
  const w = useWallet();
  const [sourceAddress, setSourceAddress] = useState('');
  const [controller, setController] = useState('');
  const [inner, setInner] = useState<string | null>(null);
  const [expected, setExpected] = useState<string | null>(null);
  const [matches, setMatches] = useState<boolean | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [already, setAlready] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const srcOk = (() => { try { return isAddress(getAddress(sourceAddress)); } catch { return false; } })();
  const ctrlOk = (() => { try { return isAddress(getAddress(controller)); } catch { return false; } })();

  // Default the controller to the connected account, and the source to it too —
  // most people will bind an address they hold in the same wallet.
  useEffect(() => { if (w.address && !controller) setController(w.address); }, [w.address, controller]);

  const step: Step = sig ? 3 : (srcOk && ctrlOk && matches ? 2 : 1);

  /** Compute the digest pair and CHECK it against the contract before signing. */
  async function prepare() {
    setErr(null); setBusy(true); setSig(null); setTxHash(null);
    try {
      const src = getAddress(sourceAddress), ctrl = getAddress(controller);
      const i = innerDigest(ctrl, src, M.operator.chainKey, M.contracts.arrearsRegistry.address, CC3.chainIdDec);
      const local = prefixed(i);
      const onchain: string = await read().registrationDigest(ctrl, src, M.operator.chainKey);
      setInner(i); setExpected(onchain); setMatches(local.toLowerCase() === onchain.toLowerCase());
      const id: string = await read().operatorIdOf(M.operator.chainKey, src);
      setOperatorId(id);
      setAlready(await read().isRegistered(id));
    } catch (e: any) { setErr(e.shortMessage ?? e.message ?? String(e)); }
    setBusy(false);
  }

  async function doSign() {
    setErr(null); setBusy(true);
    try {
      if (!w.address || getAddress(w.address) !== getAddress(sourceAddress)) {
        throw new Error(`Switch your wallet to ${short(sourceAddress, 8, 6)} — step 1 must be signed by the source-chain key itself.`);
      }
      setSig(await signInner(inner!, w.address));
    } catch (e: any) { setErr(e.shortMessage ?? e.message ?? String(e)); }
    setBusy(false);
  }

  async function doSubmit() {
    setErr(null); setBusy(true);
    try {
      if (!w.address || getAddress(w.address) !== getAddress(controller)) {
        throw new Error(`Switch your wallet to ${short(controller, 8, 6)} — step 2 must be sent by the Creditcoin controller.`);
      }
      const c = await registryWrite();
      const tx = await c.registerOperator(getAddress(sourceAddress), M.operator.chainKey, sig!);
      const rc = await tx.wait();
      setTxHash(rc.hash);
    } catch (e: any) { setErr(e.shortMessage ?? e.message ?? String(e)); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {!w.address && (
        <Panel className="p-4">
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            <strong className="text-fg">Not connected, and you can still read all of this.</strong>{' '}
            The digest below computes from any two addresses you type — it is an{' '}
            <code>eth_call</code> against the deployed registry. A wallet is needed only to sign
            step 2 and send step 3.
          </p>
          <div className="mt-3"><ConnectButton /></div>
        </Panel>
      )}

      <Panel className="p-6">
        <Eyebrow>Why this takes two wallets</Eyebrow>
        <p className="mt-3 max-w-[74ch] text-[15px] leading-[1.65] text-fg-2">
          The bond lives on Creditcoin. The evidence names an <strong className="text-fg">Ethereum</strong>{' '}
          address. <strong className="text-fg">Nothing in an Attestcoin proof connects those two
          identities</strong> — so before a bond can answer for an address, the key behind that
          address has to say so itself.
        </p>
        <p className="mt-3 max-w-[74ch] text-[15px] leading-[1.65] text-fg-2">
          That signature is <strong className="text-fg">the one thing in Arrears the precompile
          does not verify</strong>. Everything else — that a transaction happened, that it failed,
          what it called, how much gas it burned — is proven. This is asserted, and checked with{' '}
          <code className="text-fg">ecrecover</code>. It is sound because an operator gains nothing
          by binding an address they do not control; it only creates liability. But it is a
          different kind of claim, and it is the reason Arrears cannot slash an address nobody
          controls.
        </p>
      </Panel>

      {/* ── step 1: the two identities ─────────────────────────────────────── */}
      <Panel className="p-6">
        <StepHead n={1} done={step > 1} title="Name the two identities"
          proves="Establishes what will be bound to what. Nothing is signed or sent yet." />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Source-chain address" hint={`the Ethereum address whose failures the bond answers for · chain key ${M.operator.chainKey}`}
            value={sourceAddress} onChange={setSourceAddress} ok={srcOk}
            action={w.address ? { label: 'use connected', onClick: () => setSourceAddress(w.address!) } : undefined} />
          <Field label="Creditcoin controller" hint="the account that posts and may withdraw the bond"
            value={controller} onChange={setController} ok={ctrlOk}
            action={w.address ? { label: 'use connected', onClick: () => setController(w.address!) } : undefined} />
        </div>
        <button onClick={prepare} disabled={!srcOk || !ctrlOk || busy}
          className="mono mt-4 rounded-inner border border-line bg-bg-raised px-4 py-2 text-[12.5px] hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-40">
          {busy && !inner ? 'checking…' : 'compute the digest'}
        </button>

        {inner && (
          <div className="mt-5 space-y-3">
            <DigestRow label="what your Ethereum key signs" sub="the inner hash" value={inner} />
            <DigestRow label="what the contract checks" sub="EIP-191 prefixed, from registrationDigest() on chain" value={expected!} />
            <div className="mono flex items-center gap-2 text-[11.5px]"
              style={{ color: matches ? 'var(--pass)' : 'var(--miss)' }}>
              <span className="h-[5px] w-[5px] rounded-full" style={{ background: matches ? 'var(--pass)' : 'var(--miss)' }} />
              {matches
                ? 'the prefix your wallet adds reproduces exactly what the contract checks — verified against the deployed registry'
                : 'MISMATCH — do not sign. The digest your wallet would produce is not the one the contract checks.'}
            </div>
            {already && (
              <p className="mono text-[11.5px]" style={{ color: 'var(--miss)' }}>
                This source address is already registered. Registration happens once.
              </p>
            )}
            {operatorId && (
              <div className="mono text-[11px] text-fg-3">
                operatorId <span className="text-fg-2">{operatorId}</span>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── step 2: sign with the Ethereum key ─────────────────────────────── */}
      <Panel className={cn('p-6', step < 2 && 'opacity-45')}>
        <StepHead n={2} done={!!sig} title="Sign with the source-chain key"
          proves="Proves control of the Ethereum address. This is the assertion the precompile cannot make for you." />
        <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-fg-3">
          Your wallet must be on <strong className="text-fg-2">{srcOk ? short(sourceAddress, 10, 6) : 'the source address'}</strong>{' '}
          for this step. No transaction is sent and no gas is spent — it is a signature only, and
          it can be made on any network.
        </p>
        <button onClick={doSign} disabled={step < 2 || busy || !!sig || !w.address}
          className="mono mt-4 rounded-inner border border-line bg-fg px-4 py-2 text-[12.5px] text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {sig ? 'signed' : !w.address ? 'connect a wallet to sign' : busy ? 'waiting for your wallet…' : 'sign the digest'}
        </button>
        {sig && <DigestRow className="mt-4" label="signature" sub="65 bytes, recovered on chain with ecrecover" value={sig} />}
      </Panel>

      {/* ── step 3: submit from the controller ─────────────────────────────── */}
      <Panel className={cn('p-6', step < 3 && 'opacity-45')}>
        <StepHead n={3} done={!!txHash} title="Submit from the Creditcoin controller"
          proves="Records the binding on chain. The registry recovers the signature and refuses if it does not match." />
        <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-fg-3">
          Now switch your wallet to <strong className="text-fg-2">{ctrlOk ? short(controller, 10, 6) : 'the controller'}</strong>{' '}
          on Creditcoin CC3. This one is a transaction and costs gas.
        </p>
        {/* When the wallet is on the wrong chain this button SWITCHES rather than
            sitting disabled under a label that reads like an instruction. A
            control that names an action must perform it. */}
        <button onClick={w.address && !w.onCC3 ? w.switchToCC3 : doSubmit}
          disabled={step < 3 || busy || !!txHash || !w.address}
          className="mono mt-4 rounded-inner border border-line bg-fg px-4 py-2 text-[12.5px] text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {txHash ? 'registered' : !w.address ? 'connect a wallet to submit' : !w.onCC3 ? 'switch to Creditcoin CC3' : busy ? 'waiting…' : 'register operator'}
        </button>
        {txHash && (
          <div className="mt-4 rounded-inner border border-line bg-bg p-4">
            <div className="mono text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--pass)' }}>bound on chain</div>
            <div className="mono mt-2 text-[12px]">
              <Tx chain="cc3" hash={txHash} />{' · '}
              <Addr chain="sepolia" addr={sourceAddress} label={`source ${short(sourceAddress, 6, 4)}`} />
            </div>
            <p className="mt-2 text-[12.5px] text-fg-3">
              The bond posted by this controller now answers for that address, and for no other.
            </p>
          </div>
        )}
      </Panel>

      {err && (
        <Panel className="p-4">
          <p className="mono text-[12px] leading-relaxed" style={{ color: 'var(--miss)' }}>{err}</p>
        </Panel>
      )}
    </div>
  );
}

function StepHead({ n, title, proves, done }: { n: number; title: string; proves: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="mono grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]"
        style={{ borderColor: done ? 'var(--pass)' : 'var(--line)', color: done ? 'var(--pass)' : 'var(--fg-3)' }}>
        {done ? '✓' : n}
      </div>
      <div>
        <h3 className="text-[16.5px] font-medium text-fg">{title}</h3>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-fg-3">
          <span className="mono text-[10px] uppercase tracking-[0.1em]">proves · </span>{proves}
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, value, onChange, ok, action }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; ok: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="mono text-[10.5px] uppercase tracking-[0.09em] text-fg-3">{label}</label>
        {action && <button onClick={action.onClick} className="mono text-[10px] text-fg-3 underline hover:text-fg">{action.label}</button>}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value.trim())} spellCheck={false} placeholder="0x…"
        className={cn('mono mt-1.5 w-full rounded-inner border bg-bg px-3 py-2.5 text-[12.5px] text-fg outline-none focus:border-fg-3',
          value && !ok ? 'border-miss' : 'border-line')} />
      <p className="mt-1.5 text-[11.5px] leading-snug text-fg-3">{hint}</p>
    </div>
  );
}

function DigestRow({ label, sub, value, className }: { label: string; sub: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-inner border border-line bg-bg p-3', className)}>
      <div className="mono text-[10px] uppercase tracking-[0.1em] text-fg-3">{label}</div>
      <div className="text-[11px] text-fg-3">{sub}</div>
      <div className="mono mt-1.5 break-all text-[11.5px] text-fg">{value}</div>
    </div>
  );
}
