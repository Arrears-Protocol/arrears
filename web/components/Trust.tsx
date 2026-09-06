import { M } from '../lib/manifest';
import { Addr } from './Hash';

/** Static. The one trust assumption, and why the attestation cadence costs nothing. */
export function Trust() {
  return (
    <section id="trust">
      <div className="wrap">
        <h2>What we take on trust</h2>
        <h3>One thing, and the precompile does not verify it</h3>
        <p>
          Everything else here is proven. That a transaction was included, that it failed, what it
          called, how much gas it burned — all of it comes out of bytes the block-prover precompile
          verified. But <strong>the bond lives on Creditcoin while the evidence names an Ethereum
          address</strong>, and nothing in an Attestcoin proof connects those two identities.
        </p>
        <p>
          The registry closes that gap with an EIP-191 signature: the source-chain key signs a
          digest binding it to its Creditcoin controller, checked with <code>ecrecover</code>.
          Sound in practice — an operator gains nothing by binding an address they do not control,
          since it only creates liability. But it is a different <em>kind</em> of claim from
          everything around it, and a compromised source-chain key means a wrongly attributable
          bond that no amount of proving would catch.
        </p>
        <p className="note">
          It is also why the live slash runs on Sepolia. You cannot bond an operator whose keys you
          do not hold — so the seven mainnet failures below stand as a read-only gallery of what
          the protocol would have caught, and the slash runs where we hold the key. The split is
          evidence that the check is real.
        </p>

        <h3 style={{ marginTop: 34 }}>Settlement-time, not interception</h3>
        <p>
          Broadcast to provable is <strong>{M.attestation.measuredLagBlocks} blocks, about eight
          minutes</strong> — measured, not estimated. Arrears cannot stop a failure; by the time
          anything is provable the transaction has been final for minutes. But slashing a bond
          after a proven failure has no real-time requirement: the failure already happened and
          the fault is already fixed. The cadence would be fatal to a liquidation guard. It costs
          this design nothing.
        </p>
        <p className="small">
          Every artifact on this page was already mined before you loaded it. Nothing here waits.
        </p>

        <h3 style={{ marginTop: 34 }}>Also true</h3>
        <ul className="plain">
          <li><strong>No claimant reward.</strong> A bounty would make <code>beneficiary</code> a
            value the paying relayer could redirect. So the claimant's reward is the slash landing
            where it belongs — which does mean nobody is paid to go looking.</li>
          <li><strong>A careful operator can fail without consequence</strong> by always
            over-provisioning gas. Only out-of-gas is slashable, deliberately.</li>
          <li><strong>Testnet, unaudited.</strong> The bond is play money until it is not.</li>
        </ul>

        <div className="spacer" />
        <p className="small">
          Registry <Addr chain="cc3" addr={M.contracts.arrearsRegistry.address} /> ·{' '}
          Court <Addr chain="cc3" addr={M.contracts.arrearsCourt.address} /> ·{' '}
          Credit line <Addr chain="cc3" addr={M.contracts.arrearsCreditLine.address} /> ·{' '}
          Probe <Addr chain="cc3" addr={M.contracts.verdictProbe.address} />
          <br />All four source-verified, so the explorer decodes these events without us.
        </p>
      </div>
    </section>
  );
}
