'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAddress, isAddress } from 'ethers';
import { M } from '../../../lib/manifest';
import { registryRead } from '../../../lib/dashRead';
import { Panel, SectionHead, Eyebrow } from '../../../components/ui/primitives';
import { cn } from '../../../lib/cn';

export default function Lookup() {
  const r = useRouter();
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(null); setBusy(true);
    try {
      const s = v.trim();
      if (/^0x[0-9a-fA-F]{64}$/.test(s)) { r.push(`/dashboard/o/${s}`); return; }
      if (isAddress(getAddress(s))) {
        const id: string = await registryRead().operatorIdOf(M.operator.chainKey, getAddress(s));
        r.push(`/dashboard/o/${id}`); return;
      }
      setErr('Enter a source-chain address or a 32-byte operator id.');
    } catch { setErr('Enter a source-chain address or a 32-byte operator id.'); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Lender or observer" title={<>Read an operator&apos;s record.</>}>
        No wallet, no account, nothing installed. Everything below is an <code>eth_call</code>.
      </SectionHead>

      <Panel className="p-6">
        <Eyebrow>Look up</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={v} onChange={(e) => setV(e.target.value)} spellCheck={false}
            placeholder="source-chain address, or a 32-byte operator id"
            onKeyDown={(e) => e.key === 'Enter' && go()}
            className={cn('mono min-w-[280px] flex-1 rounded-inner border bg-bg px-3 py-2.5 text-[12.5px] text-fg outline-none focus:border-fg-3',
              err ? 'border-miss' : 'border-line')} />
          <button onClick={go} disabled={busy}
            className="mono rounded-inner border border-line bg-fg px-4 py-2 text-[12.5px] text-bg hover:opacity-90 disabled:opacity-40">
            read record
          </button>
        </div>
        {err && <p className="mono mt-2 text-[11.5px]" style={{ color: 'var(--miss)' }}>{err}</p>}
        <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-fg-3">
          There is no enumerable operator list on chain — <code>operator</code> and{' '}
          <code>claimsAgainst</code> both need an id you already hold — so this takes an address
          rather than offering a directory. A real deployment would want an indexer.
        </p>
        <button onClick={() => r.push(`/dashboard/o/${M.operator.operatorId}`)}
          className="mono mt-3 text-[12px] text-fg-3 underline hover:text-fg">
          or read this deployment&apos;s operator →
        </button>
      </Panel>
    </div>
  );
}
