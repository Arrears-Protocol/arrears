/**
 * The only module in the read bundle that touches a network.
 *
 * Three rules, structural rather than remembered:
 *
 *  1. eth_call ONLY. Nothing exported here can send a transaction. The relayer is the sole
 *     writer and it lives server-side, in app/api/claim, because it holds a key.
 *
 *  2. NEVER read a failed transaction's revert reason on chain. A receipt never carries
 *     revert data, and the public CC3 RPC offers no debug_traceTransaction, so a mined
 *     revert's reason can only be recovered by re-running the call. Refusal reasons come
 *     from previewClaim over eth_call, always. (An earlier version of this comment blamed
 *     pallet-evm; that was a misreading -- docs/principles.md rule 4.)
 *
 *  3. Nothing waits on a chain. Every artifact is already mined. These calls confirm facts
 *     the page has already rendered from the manifest; if one is slow or fails, the page
 *     stays complete and simply lacks a "confirmed live" mark.
 *
 * CORS was verified before this was designed: both the CC3 RPC and the Creditcoin prover
 * return access-control-allow-origin: *, so the browser talks to them directly and the read
 * path needs no backend at all.
 */
import { JsonRpcProvider, Contract, Interface, AbiCoder, keccak256 } from 'ethers';
import { M } from './manifest';

export const cc3 = () => new JsonRpcProvider(M.chains.cc3.rpc, M.chains.cc3.chainId, { staticNetwork: true });

export const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'] as const;
export const MISS = ['None', 'ChainKey', 'Window', 'Target', 'Selector', 'Operator', 'Revoked', 'Expired', 'Exhausted'] as const;
export type VerdictName = (typeof VERDICT)[number];
export type MissName = (typeof MISS)[number];

const COURT_ABI = [
  'function previewClaim(bytes32 operatorId, uint64 height, bytes txBytes, (bytes32,(bytes32,bool)[]) merkleProof, (bytes32,bytes32[]) continuityProof) view returns (bool proofValid, uint8 verdict, uint8 miss, bytes32 selectedCoverage, uint256 wouldSlash)',
  'function claim(bytes32 claimId) view returns ((bytes32 claimId, bytes32 coverageId, bytes32 operatorId, uint64 chainKey, uint64 height, uint64 txIndex, address target, bytes4 selector, uint64 gasUsed, uint64 gasLimit, uint8 verdict, uint256 slashed, address beneficiary, uint64 ruledAt))',
  'function claimIdOf(uint64 chainKey, uint64 height, uint64 txIndex) pure returns (bytes32)',
  'function claimsAgainst(bytes32 operatorId) view returns (bytes32[])',
];
const REG_ABI = [
  'function operator(bytes32) view returns ((address controller, address sourceAddress, uint64 chainKey, uint256 bonded, uint256 committed, uint256 slashed, uint64 withdrawableAt))',
  'function payable_(bytes32 coverageId) view returns (uint256)',
  'function freeBond(bytes32 operatorId) view returns (uint256)',
];
const LINE_ABI = [
  'function terms(bytes32) view returns ((uint256 limit, uint16 premiumBps, uint32 strikes, uint64 repricedAt))',
];
const PROBE_ABI = [
  'function read(uint64 chainKey, uint64 height, bytes txBytes, (bytes32,(bytes32,bool)[]) merkleProof, (bytes32,bytes32[]) continuityProof) view returns ((bool proofValid, uint8 verdict, uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit, uint256 logCount, address from, address target, bytes4 selector, uint64 txIndex))',
];

export const courtIface = new Interface(COURT_ABI);
const court = () => new Contract(M.contracts.arrearsCourt.address, COURT_ABI, cc3());
const registry = () => new Contract(M.contracts.arrearsRegistry.address, REG_ABI, cc3());
const creditLine = () => new Contract(M.contracts.arrearsCreditLine.address, LINE_ABI, cc3());
const probe = () => new Contract(M.contracts.verdictProbe.address, PROBE_ABI, cc3());

export interface Proof { headerNumber: number; txIndex: number; txBytes: string; mp: any; cp: any }

/** Fetch a proof straight from the Creditcoin prover. CORS-open, so no proxy. */
export async function fetchProof(chainKey: number, txHash: string, signal?: AbortSignal): Promise<Proof> {
  const r = await fetch(`${M.prover}/api/v1/proof-by-tx/${chainKey}/${txHash}`, { signal });
  if (!r.ok) throw new Error(`prover ${r.status}`);
  const j = await r.json();
  const d = j.data ?? j;
  return {
    headerNumber: Number(d.headerNumber),
    txIndex: Number(d.txIndex),
    txBytes: d.txBytes,
    mp: [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])],
    cp: [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots],
  };
}

export interface Preview {
  proofValid: boolean;
  verdict: VerdictName;
  miss: MissName;
  selectedCoverage: string;
  wouldSlashWei: bigint;
  height: number;
  txIndex: number;
  contRoots: number;
}

/** The adjudication the court performs, run for free. The only live call the interactive
 *  path makes before submitting, and the reason sponsorship is safe. */
export async function preview(sourceTx: string, signal?: AbortSignal): Promise<Preview> {
  const p = await fetchProof(M.operator.chainKey, sourceTx, signal);
  const r = await court().previewClaim(M.operator.operatorId, p.headerNumber, p.txBytes, p.mp, p.cp);
  return {
    proofValid: r[0],
    verdict: VERDICT[Number(r[1])],
    miss: MISS[Number(r[2])],
    selectedCoverage: r[3],
    wouldSlashWei: r[4],
    height: p.headerNumber,
    txIndex: p.txIndex,
    contRoots: p.cp[1].length,
  };
}

/** Classify any source-chain transaction through the deployed public probe. What the gallery
 *  reads. Same ArrearsVerdict library the court rules with, inlined into both. */
export async function probeRead(chainKey: number, sourceTx: string, signal?: AbortSignal) {
  const p = await fetchProof(chainKey, sourceTx, signal);
  const o = await probe().read(chainKey, p.headerNumber, p.txBytes, p.mp, p.cp);
  return {
    proofValid: o.proofValid as boolean,
    verdict: VERDICT[Number(o.verdict)],
    receiptStatus: Number(o.receiptStatus),
    gasUsed: Number(o.gasUsed),
    gasLimit: Number(o.gasLimit),
    logCount: Number(o.logCount),
    from: o.from as string,
    target: o.target as string,
    selector: o.selector as string,
    txIndex: Number(o.txIndex),
    contRoots: p.cp[1].length as number,
  };
}

/** Has this evidence already been ruled on? Free, and what makes the ordering hazard
 *  unreachable: the submission controls never render for evidence that has a ruling. */
export async function ruledAt(height: number, txIndex: number): Promise<number> {
  const c = court();
  const id = await c.claimIdOf(M.operator.chainKey, height, txIndex);
  const cl = await c.claim(id);
  return Number(cl.ruledAt);
}

export async function operatorState() {
  const [op, terms, claims] = await Promise.all([
    registry().operator(M.operator.operatorId),
    creditLine().terms(M.operator.operatorId),
    court().claimsAgainst(M.operator.operatorId),
  ]);
  return {
    bonded: op.bonded as bigint,
    committed: op.committed as bigint,
    slashed: op.slashed as bigint,
    limit: terms.limit as bigint,
    premiumBps: Number(terms.premiumBps),
    strikes: Number(terms.strikes),
    claimCount: claims.length as number,
  };
}

/**
 * Which pool evidence has already been ruled on.
 *
 * One RPC call, not one per item: `claimsAgainst` returns every claim id against the operator,
 * and `claimIdOf` is pure — keccak256(chainKey, height, txIndex) — so the ids for the pool are
 * computed locally and intersected. Without this a reload re-offers spent evidence and the
 * judge's first click is refused, which reads as broken even though the relayer handles it
 * cleanly.
 */
export function claimIdFor(chainKey: number, height: number, txIndex: number): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(['uint64', 'uint64', 'uint64'], [chainKey, height, txIndex]),
  );
}

export async function ruledClaimIds(): Promise<Set<string>> {
  const ids: string[] = await court().claimsAgainst(M.operator.operatorId);
  return new Set(ids.map((i) => i.toLowerCase()));
}

export async function coveragePayable(coverageId: string): Promise<bigint> {
  return registry().payable_(coverageId);
}

export async function contractDeployed(address: string): Promise<boolean> {
  return (await cc3().getCode(address)).length > 2;
}
