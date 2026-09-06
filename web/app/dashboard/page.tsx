'use client';
import Link from 'next/link';
import { M } from '../../lib/manifest';
import { Panel, SectionHead, Eyebrow } from '../../components/ui/primitives';
import { ConnectButton, useWallet } from '../../components/dash/Wallet';
import { Addr } from '../../components/Hash';

const ROLES = [
  ['Operator', '/dashboard/operator', 'Post a bond, declare what it answers for, revoke, withdraw, and read your own record.', true],
  ['Claimant', '/dashboard/claim', 'Bring evidence against a bonded operator, choose the submission shape, and name yourself in the ruling.', true],
  ['Lender or observer', '/dashboard/o', "Read any operator's record and credit terms.", false],
] as const;

export default function DashboardHome() {
  const w = useWallet();
  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Dashboard" title={<>Reading is open. Acting needs a wallet.</>}>
        The landing page requires nothing installed and that does not change. This is where you
        act — and one of the three roles here still needs no wallet at all.
      </SectionHead>

      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map(([name, href, desc, needsWallet]) => (
          <Link key={href} href={href} className="group">
            <Panel className="flex h-full flex-col p-6 transition-colors group-hover:border-fg-3">
              <div className="mono text-[10px] uppercase tracking-[0.11em]"
                style={{ color: needsWallet ? 'var(--moved)' : 'var(--pass)' }}>
                {needsWallet ? 'wallet to act' : 'no wallet needed'}
              </div>
              <h3 className="display mt-2.5 text-[22px] leading-none">{name}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-fg-3">{desc}</p>
              <span className="mono mt-auto pt-4 text-[11.5px] text-fg-2">open →</span>
            </Panel>
          </Link>
        ))}
      </div>

      <Panel className="p-6">
        <Eyebrow>Wallet</Eyebrow>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <ConnectButton />
          <p className="max-w-[54ch] text-[13px] leading-relaxed text-fg-3">
            {w.address
              ? 'Connected. Disconnect any time — it never affects what you can read.'
              : 'Not connected. Everything on this dashboard that only reads still works.'}
          </p>
        </div>
      </Panel>

      <Panel className="p-6">
        <Eyebrow>The operator this deployment runs on</Eyebrow>
        <p className="mt-2 max-w-[74ch] text-[13.5px] leading-relaxed text-fg-2">
          One operator is registered and bonded on CC3, bound to a Sepolia address we hold the key
          for. Its record is public and needs no wallet to read.
        </p>
        <div className="mono mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-fg-3">
          <span>source <Addr chain="sepolia" addr={M.operator.sourceAddress} /></span>
          <span>controller <Addr chain="cc3" addr={M.operator.controller} /></span>
        </div>
        <Link href={`/dashboard/o/${M.operator.operatorId}`}
          className="mono mt-4 inline-block rounded-inner border border-line px-4 py-2 text-[12.5px] hover:border-fg-3">
          read its record →
        </Link>
      </Panel>
    </div>
  );
}
