/**
 * The single source of truth. Everything the site renders comes from here and nowhere else.
 * demo/manifest.json holds hashes and addresses only -- no results, no fixtures -- so a value
 * on the page is either from this file or read live from chain.
 */
import raw from '../../demo/manifest.json';

export const M = raw as unknown as Manifest;

export type ChainId = 'cc3' | 'sepolia' | 'mainnet';

export interface Manifest {
  chains: Record<ChainId, { name: string; chainId: number; rpc: string; explorer: string; attestcoinChainKey?: number }>;
  prover: string;
  contracts: Record<string, { address: string; chain: ChainId; deployTx?: string; verified?: boolean; note?: string }>;
  operator: {
    operatorId: string; sourceAddress: string; sourceChain: ChainId; chainKey: number;
    controller: string; treasury: string; registrationTx: string; bondTx: string;
    coverages: Array<{ id: string; target: string; targetName: string; selector: string; selectorName: string;
      fromHeight: number; toHeight: number; tx: string; perClaimCapWei?: string; note?: string }>;
    note: string;
  };
  rulings: {
    relayer: string; beneficiary: string;
    slash: Ruling; refusal: Ruling; strictRefusal: Ruling; outOfScope: Ruling;
    finalState: { bondedWei: string; slashedWei: string; creditLimitWei: string; premiumBps: number; strikes: number };
  };
  gallery: { title: string; note: string; items: GalleryItem[] };
  slash: { sourceTx: string; block: number; txIndex: number; gasUsed: number; gasLimit: number; honestlyNeeded: number;
    operator: string; target: string; targetName: string; selector: string; selectorName: string; expectedVerdict: string; note: string };
  exploits: Record<string, any>;
  attestation: { measuredLagBlocks: number; measuredLagSecondsApprox: number; chain: string; note: string };
  evidencePool?: { target: string; selectorNames: Record<string, string>; items: PoolItem[] };
}

export interface Ruling {
  hash?: string; minedTx?: string; status?: number; gasUsed?: number;
  sourceTx: string; sourceBlock: number; verdict?: string; slashedWei?: string;
  beneficiary?: string; claimId?: string; explorer?: string | null;
  refusalReasonSelector?: string; namedError?: string; error?: string;
  missAxis?: string; recordedAnything?: boolean; note?: string;
  sourceGasUsed?: number; sourceGasLimit?: number;
  cc3Block?: number; ruledAtISO?: string;
}

export interface GalleryItem {
  window: string; sourceTx: string; note: string; block: number; txIndex: number;
  contRoots: number; expectedVerdict: string; expectedGasUsed: number; expectedGasLimit: number;
  target: string; selector: string; from: string;
}

export interface PoolItem {
  kind: 'OutOfGas' | 'ExplicitRevert';
  txHash: string; block: number; gasUsed: number; gasLimit: number;
  selector: string; selectorName: string; label: string;
}

/** Outcome classes. Three of them, and none is an error. */
export type OutcomeClass = 'slashed' | 'recorded' | 'refused';

export const OUTCOME: Record<OutcomeClass, { label: string; sub: string }> = {
  slashed:  { label: 'Bond moved',   sub: 'out of gas — the sender chose the limit' },
  recorded: { label: 'Record kept',  sub: 'explicit revert — on the record, never slashable' },
  refused:  { label: 'Turned away',  sub: 'outside the promise — nothing happened at all' },
};
