/** Static. No calls. The rule, and the two measured numbers that force it to be narrow. */
export function FaultLine() {
  return (
    <section id="rule">
      <div className="wrap">
        <h2>The fault line</h2>
        <h3>Reverting is not failing a duty. Running out of gas is.</h3>
        <p>
          <strong>1.47% of Ethereum mainnet transactions revert</strong> — roughly 26,000 a day,
          measured across 49,140 transactions in 200 attested blocks. A contract that slashed on{' '}
          <code>receiptStatus == 0</code> would be slashing operators for participating in DeFi.
        </p>
        <p>
          So Arrears slashes on one thing only: <strong><code>gasUsed &gt;= gasLimit</code></strong>.
          The sender chose the limit, and nobody can race them into choosing it badly. That is{' '}
          <strong>10.3%</strong> of reverts. Everything else is recorded and never punished — the
          callee rejected the call, and the state it rejected against may have moved between
          broadcast and inclusion. Arrears cannot prove from the attested bytes that it did not.
        </p>
        <div className="panel">
          <p style={{ marginBottom: 10 }}>
            There is also nothing else to go on. <strong>A reverted transaction carries no logs —
            ever.</strong> 813 of 813 measured had zero logs and an all-zero bloom, because a
            top-level revert rolls back the journal. The attested encoding has no revert-reason
            field either.
          </p>
          <p className="small" style={{ margin: 0 }}>
            The documented Attestcoin pattern is event-driven throughout, which means it cannot
            see failures at all. Arrears reads calldata, gas and identity instead.
          </p>
        </div>
      </div>
    </section>
  );
}
