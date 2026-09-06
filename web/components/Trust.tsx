'use client';
import { useState } from 'react';
import { M } from '../lib/manifest';
import { Addr } from './Hash';
import { Container, Reveal, SectionHead, Panel, Eyebrow } from './ui/primitives';

/** Prose section 2 + the limitations accordion.
 *  Accordion harvested from nodus's FAQ (divide-y rows, chevron rotate on open),
 *  normalised and used for limitations rather than sales questions. */

const LIMITS: Array<[string, React.ReactNode]> = [
  ['No claimant reward, deliberately',
    <>A bounty would make <code className="text-fg">beneficiary</code> a value the paying relayer
     could redirect. So the claimant&apos;s reward is the slash landing where it belongs, and
     nothing more. That is a real weakness of unrewarded fraud proofs: nobody is paid to go
     looking.</>],
  ['A careful operator can fail without consequence',
    <>Only <span className="mono">gasUsed &gt;= gasLimit</span> is slashable. An operator who
     always over-provisions gas can fail by every other means and never be punished. Deliberate,
     and a real limit.</>],
  ['Testnet, unaudited',
    <>The bond is play money until it is not. Nothing here has been audited.</>],
  ['One relayer key',
    <>Concurrent sponsored submissions collide on nonces until the relayer runs a queue or a key
     pool. Operational, not contractual.</>],
];

function Accordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line-soft">
      {LIMITS.map(([q, a], i) => (
        <div key={q}>
          <button onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 py-4 text-left">
            <span className="text-[15px] text-fg">{q}</span>
            <span className="mono text-[13px] text-fg-3 transition-transform"
              style={{ transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
          </button>
          {open === i && <div className="max-w-[76ch] pb-4 text-[14px] leading-[1.65] text-fg-2">{a}</div>}
        </div>
      ))}
    </div>
  );
}

export function Trust() {
  return (
    <section id="trust" className="py-24">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="What we take on trust"
            title={<>One thing, and the precompile does not verify it.</>}
          >
            <p className="mb-4">
              Everything else here is proven. That a transaction was included, that it failed, what
              it called, how much gas it burned — all of it comes out of bytes the block-prover
              precompile verified. But <strong className="text-fg">the bond lives on Creditcoin
              while the evidence names an Ethereum address</strong>, and nothing in an Attestcoin
              proof connects those two identities.
            </p>
            <p>
              The registry closes that gap with an EIP-191 signature, checked with{' '}
              <code className="text-fg">ecrecover</code>. Sound in practice — an operator gains
              nothing by binding an address they do not control. But it is a different <em>kind</em>{' '}
              of claim from everything around it, and a compromised source-chain key means a
              wrongly attributable bond that no amount of proving would catch.
            </p>
          </SectionHead>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-2">
          <Reveal delay={0.06}>
            <Panel className="h-full p-6">
              <Eyebrow>Why the live slash runs on Sepolia</Eyebrow>
              <p className="mt-3 text-[14.5px] leading-[1.65] text-fg-2">
                You cannot bond an operator whose keys you do not hold. So the seven mainnet
                failures stand as a read-only gallery of what the protocol would have caught, and
                the slash runs where we hold the key. <strong className="text-fg">The split is
                evidence that the check is real.</strong>
              </p>
            </Panel>
          </Reveal>
          <Reveal delay={0.12}>
            <Panel className="h-full p-6">
              <Eyebrow>Settlement-time, not interception</Eyebrow>
              <p className="mt-3 text-[14.5px] leading-[1.65] text-fg-2">
                Broadcast to provable is{' '}
                <span className="mono text-fg">{M.attestation.measuredLagBlocks} blocks, about
                eight minutes</span> — measured. Arrears cannot stop a failure. But slashing a bond
                after a proven failure has no real-time requirement: the failure already happened
                and the fault is already fixed. The cadence would be fatal to a liquidation guard.
                It costs this design nothing.
              </p>
            </Panel>
          </Reveal>
        </div>

        <Reveal delay={0.18}>
          <Panel className="mt-4 px-6 py-2">
            <Accordion />
          </Panel>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mono mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-fg-3">
            <span>registry <Addr chain="cc3" addr={M.contracts.arrearsRegistry.address} /></span>
            <span>court <Addr chain="cc3" addr={M.contracts.arrearsCourt.address} /></span>
            <span>credit line <Addr chain="cc3" addr={M.contracts.arrearsCreditLine.address} /></span>
            <span>probe <Addr chain="cc3" addr={M.contracts.verdictProbe.address} /></span>
          </div>
          <p className="mt-2 text-[12.5px] text-fg-3">
            All four source-verified, so the explorer decodes these events without us.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
