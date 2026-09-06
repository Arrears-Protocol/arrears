import { Container, Reveal, SectionHead, Panel } from './ui/primitives';

/** Prose section 1. Static, no calls. Shell: nodus's bordered information block. */
export function FaultLine() {
  return (
    <section id="rule" className="py-24">
      <Container>
        <Reveal>
          <SectionHead eyebrow="The fault line" title={<>Reverting is not failing a duty. Running out of gas is.</>}>
            <p className="mb-4">
              <strong className="text-fg">1.47% of Ethereum mainnet transactions revert</strong> —
              roughly 26,000 a day, measured across 49,140 transactions in 200 attested blocks. A
              contract that slashed on <code className="text-fg">receiptStatus == 0</code> would be
              slashing operators for participating in DeFi.
            </p>
            <p>
              So Arrears slashes on one thing only:{' '}
              <strong className="text-fg mono">gasUsed &gt;= gasLimit</strong>. The sender chose
              the limit, and nobody can race them into choosing it badly. That is{' '}
              <strong className="text-fg">10.3%</strong> of reverts. Everything else is recorded and
              never punished — the callee rejected the call, and the state it rejected against may
              have moved between broadcast and inclusion.
            </p>
          </SectionHead>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['1.47%', 'of mainnet transactions revert', '49,140 measured across 200 attested blocks'],
              ['10.3%', 'of those are out of gas', 'the only class where fault is unambiguous'],
              ['0', 'logs on a reverted transaction', '813 of 813 measured, and an all-zero bloom'],
            ].map(([n, l, s]) => (
              <Panel key={l} className="p-6">
                <div className="mono text-[30px] leading-none tracking-tight text-fg">{n}</div>
                <div className="mt-3 text-[14.5px] leading-snug text-fg">{l}</div>
                <div className="mt-2 text-[13px] leading-relaxed text-fg-3">{s}</div>
              </Panel>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <Panel className="mt-4 p-6">
            <p className="max-w-[74ch] text-[15px] leading-[1.65] text-fg-2">
              There is also nothing else to go on. A top-level revert rolls back the journal, and
              the attested encoding has no revert-reason field. <strong className="text-fg">The
              documented Attestcoin pattern is event-driven throughout, which means it cannot see
              failures at all.</strong> Arrears reads calldata, gas and identity instead.
            </p>
          </Panel>
        </Reveal>
      </Container>
    </section>
  );
}
