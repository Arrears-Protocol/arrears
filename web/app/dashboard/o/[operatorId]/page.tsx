'use client';
import { use } from 'react';
import { Record } from '../../../../components/dash/Record';
import { SectionHead } from '../../../../components/ui/primitives';

export default function Page({ params }: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = use(params);
  return (
    <div className="space-y-5">
      <SectionHead eyebrow="Public record" title={<>What has been proven, and what it cost.</>}>
        Read with no wallet and no account. Every figure is an <code>eth_call</code> against the
        deployed registry, court and credit line.
      </SectionHead>
      <Record operatorId={operatorId} />
    </div>
  );
}
