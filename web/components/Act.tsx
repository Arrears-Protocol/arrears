import Link from 'next/link';
import { Container, Reveal, Panel, Eyebrow } from './ui/primitives';

/**
 * The door, in the page body.
 *
 * Placed straight after the sponsored claim, because that is the moment a reader
 * has just watched the court rule and might want to do it themselves. It is a
 * door and not a gate: nothing above or below it needs a wallet, and the copy
 * says so rather than leaving it to be discovered.
 */
export function Act() {
  return (
    <section id="act" className="py-24">
      <Container>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
          <Reveal>
            <Eyebrow>Beyond reading</Eyebrow>
            <h2 className="display mt-4 max-w-[20ch] text-[34px] leading-[1.1] tracking-[-0.015em] md:text-[42px]">
              Everything so far needed nothing installed.
            </h2>
            <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.65] text-fg-2">
              That does not change. The whole of this page, every ruling, the seven mainnet
              failures and any operator&apos;s record stay readable with no wallet, no account and
              nothing installed — including the claim you just watched the relayer pay for.
            </p>
            <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.65] text-fg-2">
              <strong className="text-fg">The dashboard is where you act.</strong> Bond an
              operator, declare what the bond answers for, revoke it, or bring evidence and put
              your own address in the ruling. Those send transactions, so those need a wallet —
              and nothing else does.
            </p>
            <Link href="/dashboard"
              className="mono mt-7 inline-block rounded-inner border border-line bg-fg px-5 py-2.5 text-[13px] text-bg transition-opacity hover:opacity-90">
              open the dashboard →
            </Link>
          </Reveal>

          <Reveal delay={0.08}>
            <Panel className="h-full p-6">
              <Eyebrow>Three roles</Eyebrow>
              <ul className="mt-4 divide-y divide-line-soft">
                {[
                  ['Operator', 'Post a bond, declare (contract, selector) coverage over a block window, revoke, withdraw.', 'wallet to act'],
                  ['Claimant', 'Bring evidence, choose the submission shape, name yourself in the ruling.', 'wallet to act'],
                  ['Lender or observer', "Read any operator's record and credit terms.", 'no wallet needed'],
                ].map(([role, what, needs]) => (
                  <li key={role} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[15px] text-fg">{role}</span>
                      <span className="mono text-[9.5px] uppercase tracking-[0.09em]"
                        style={{ color: needs === 'no wallet needed' ? 'var(--pass)' : 'var(--moved)' }}>
                        {needs}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{what}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3.5 text-[12.5px] leading-relaxed text-fg-3">
                The registration screen shows the digest being signed and states outright that the
                identity binding is the one thing the precompile does not verify. It reads without
                a wallet too.
              </p>
            </Panel>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
