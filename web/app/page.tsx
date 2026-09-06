import { Navbar, Footer } from '../components/Chrome';
import { Hero } from '../components/Hero';
import { FaultLine } from '../components/FaultLine';
import { Outcomes } from '../components/Outcomes';
import { TryIt } from '../components/TryIt';
import { Act } from '../components/Act';
import { Gallery } from '../components/Gallery';
import { Trust } from '../components/Trust';
import { DivideX } from '../components/ui/primitives';

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
 */
export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <DivideX />
        <FaultLine />
        <DivideX />
        <Outcomes />
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
