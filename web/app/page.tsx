import { Navbar, Footer } from '../components/Chrome';
import { Hero } from '../components/Hero';
import { FaultLine } from '../components/FaultLine';
import { Outcomes } from '../components/Outcomes';
import { TryIt } from '../components/TryIt';
import { Act } from '../components/Act';
import { Gallery } from '../components/Gallery';
import { Trust } from '../components/Trust';
import { DivideX } from '../components/ui/primitives';
import { operatorState } from '../lib/chain';

/**
 * Six sections, and the order is the argument:
 *   1  a refusal        — the rule is load-bearing
 *   2  the fault line   — why it has to be this narrow
 *   3  three outcomes   — four mined rulings, none of them an error
 *   4  try it           — the one interactive thing
 *   5  the gallery      — the classification at real scale
 *   6  what we trust    — the single exception, named
 *
 * Sections 1, 2, 3, 5 and 6 stand without the relayer, and every one of them
 * renders complete server-side. Only the confirmation marks need hydration.
 *
 * The operator's current figures are read HERE, on the server, and revalidated —
 * they used to be frozen into demo/manifest.json as a fallback for the reader
 * with no JavaScript, and a frozen figure against a live chain is a figure that
 * silently goes wrong. The manifest now carries hashes and addresses only.
 */
export const revalidate = 300;

/** Never let a slow or down RPC take the page with it. Rule 3 in lib/chain.ts. */
async function initialState() {
  try {
    const s = await operatorState();
    return {
      bondedWei: s.bonded.toString(), slashedWei: s.slashed.toString(),
      limitWei: s.limit.toString(), premiumBps: s.premiumBps,
      strikes: s.strikes, claimCount: s.claimCount,
    };
  } catch { return null; }
}

export default async function Page() {
  const initial = await initialState();
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <DivideX />
        <FaultLine />
        <DivideX />
        <Outcomes initial={initial} />
        <DivideX />
        <TryIt />
        <DivideX />
        <Act />
        <DivideX />
        <Gallery />
        <DivideX />
        <Trust />
      </main>
      <Footer />
    </>
  );
}
