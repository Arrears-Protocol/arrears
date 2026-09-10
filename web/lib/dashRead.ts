'use client';
import { Contract, JsonRpcProvider, formatEther } from 'ethers';
import { M } from './manifest';
import { REGISTRY_ABI, CC3 } from './wallet';

/** Read-side for the dashboard. eth_call only, no wallet needed — the observer
 *  role and every record view work with nothing installed. */
const rpc = () => new JsonRpcProvider(CC3.rpc, CC3.chainIdDec, { staticNetwork: true });
export const registryRead = () => new Contract(M.contracts.arrearsRegistry.address, REGISTRY_ABI, rpc());
export const lineRead = () => new Contract(M.contracts.arrearsCreditLine.address,
  ['function terms(bytes32) view returns ((uint256 limit, uint16 premiumBps, uint32 strikes, uint64 repricedAt))',
   'function isOpen(bytes32) view returns (bool)'], rpc());
export const courtRead = () => new Contract(M.contracts.arrearsCourt.address,
  ['function claimsAgainst(bytes32) view returns (bytes32[])',
   'function claim(bytes32) view returns ((bytes32 claimId, bytes32 coverageId, bytes32 operatorId, uint64 chainKey, uint64 height, uint64 txIndex, address target, bytes4 selector, uint64 gasUsed, uint64 gasLimit, uint8 verdict, uint256 slashed, address beneficiary, uint64 ruledAt))'], rpc());

export const ctc = (v: bigint) => `${Number(formatEther(v)).toLocaleString('en-US', { maximumFractionDigits: 4 })} tCTC`;

export interface Cov {
  id: string; chainKey: number; fromHeight: number; toHeight: number;
  committed: bigint; drawn: bigint; perClaimCap: bigint; claimDeadline: number;
  active: boolean; revokedAtHeight: number; released: boolean;
  scope: Array<{ target: string; selector: string }>; payable: bigint;
}

export async function loadOperator(operatorId: string) {
  const r = registryRead();
  const [op, ids, free] = await Promise.all([
    r.operator(operatorId), r.coveragesOf(operatorId), r.freeBond(operatorId),
  ]);
  const covs: Cov[] = await Promise.all((ids as string[]).map(async (id) => {
    const [c, scope, pay] = await Promise.all([r.coverage(id), r.coverageScope(id), r.payable_(id)]);
    return {
      id, chainKey: Number(c.chainKey), fromHeight: Number(c.fromHeight), toHeight: Number(c.toHeight),
      committed: c.committed, drawn: c.drawn, perClaimCap: c.perClaimCap,
      claimDeadline: Number(c.claimDeadline), active: c.active,
      revokedAtHeight: Number(c.revokedAtHeight), released: c.released,
      scope: (scope as any[]).map((s) => ({ target: s.target, selector: s.selector })),
      payable: pay as bigint,
    };
  }));
  const [terms, open, claimIds] = await Promise.all([
    lineRead().terms(operatorId), lineRead().isOpen(operatorId), courtRead().claimsAgainst(operatorId),
  ]);
  return {
    registered: op.sourceAddress !== '0x0000000000000000000000000000000000000000',
    controller: op.controller as string, sourceAddress: op.sourceAddress as string,
    chainKey: Number(op.chainKey), bonded: op.bonded as bigint, committed: op.committed as bigint,
    slashed: op.slashed as bigint, withdrawableAt: Number(op.withdrawableAt),
    free: free as bigint, coverages: covs,
    terms: { limit: terms.limit as bigint, premiumBps: Number(terms.premiumBps), strikes: Number(terms.strikes) },
    lineOpen: open as boolean, claimIds: claimIds as string[],
  };
}
export type OperatorView = Awaited<ReturnType<typeof loadOperator>>;

export async function loadClaims(ids: string[]) {
  const c = courtRead();
  const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];
  return Promise.all(ids.map(async (id) => {
    const x = await c.claim(id);
    return {
      claimId: id, height: Number(x.height), txIndex: Number(x.txIndex),
      target: x.target as string, selector: x.selector as string,
      gasUsed: Number(x.gasUsed), gasLimit: Number(x.gasLimit),
      verdict: VERDICT[Number(x.verdict)], slashed: x.slashed as bigint,
      beneficiary: x.beneficiary as string, ruledAt: Number(x.ruledAt),
    };
  }));
}
