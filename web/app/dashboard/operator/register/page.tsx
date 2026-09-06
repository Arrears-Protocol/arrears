'use client';
import { RegisterWizard } from '../../../../components/dash/RegisterWizard';
import { SectionHead } from '../../../../components/ui/primitives';

export default function Page() {
  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Operator · registration" title={<>Bind a Creditcoin bond to an Ethereum address.</>}>
        Two wallets, two steps, and neither is hidden. This is the one thing in Arrears the
        precompile does not verify, so the screen shows exactly what is signed and what the
        contract checks.
      </SectionHead>
      {/* Deliberately NOT wrapped in NeedsWallet. This is the screen that explains
          the one thing the precompile does not verify; putting it behind a connect
          wall would hide the argument from exactly the reader it is written for.
          The wizard gates its own buttons instead. */}
      <RegisterWizard />
    </div>
  );
}
