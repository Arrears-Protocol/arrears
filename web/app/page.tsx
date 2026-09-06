import { Hero } from '../components/Hero';
import { FaultLine } from '../components/FaultLine';
import { Outcomes } from '../components/Outcomes';
import { TryIt } from '../components/TryIt';
import { Gallery } from '../components/Gallery';
import { Trust } from '../components/Trust';
import { M } from '../lib/manifest';

/**
 * Six sections, and the order is the argument:
 *   1  a refusal        — the rule is load-bearing
 *   2  the fault line   — why it has to be this narrow
 *   3  three outcomes   — four mined rulings, none of them an error
 *   4  try it           — the one interactive thing
 *   5  the gallery      — the classification at real scale
 *   6  what we trust    — the single exception, named
 *
 * Sections 1, 2, 3, 5 and 6 stand without the relayer. If /api/claim is down, only section 4
 * is affected, and it says so rather than breaking.
 */
export default function Page() {
  return (
    <main>
      <Hero />
      <FaultLine />
      <Outcomes />
      <TryIt />
      <Gallery />
      <Trust />
      <footer>
        <div className="wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: 'var(--ink-2)' }}>Arrears</strong> — BUIDL CTC 2026 Fall ·
              Creditcoin Attestcoin Protocol
              <br />
              <a className="ext" href="https://github.com/Arrears-Protocol/arrears" target="_blank" rel="noreferrer">
                github.com/Arrears-Protocol/arrears ↗
              </a>{' '}
              · <a className="ext" href="/api/version">build version</a>
            </div>
            <div className="small" style={{ maxWidth: '46ch' }}>
              Everything on this page comes from <code>demo/manifest.json</code> — hashes and
              addresses only — or is read live from Creditcoin by your browser. Testnet,
              unaudited. Attestation lag {M.attestation.measuredLagBlocks} blocks, measured.
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
