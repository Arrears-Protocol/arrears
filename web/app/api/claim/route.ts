/**
 * The only server-side code in the project, and the only writer.
 *
 * It exists for exactly one reason: the relayer holds a key, and keys cannot live in a static
 * bundle. Everything else on the site is a browser talking straight to the CC3 RPC.
 *
 * Filing a claim is permissionless -- a claim's validity comes from the Attestcoin proof, never
 * from who carried it -- so there is no meta-transaction machinery here and none is needed. The
 * relayer is simply msg.sender, and `beneficiary` is passed through so the person who asked is
 * the one credited on chain.
 *
 * If this route is down, every other surface still works. The argument does not depend on it.
 */
import { JsonRpcProvider, Wallet, Contract, Interface, getAddress, isAddress } from 'ethers';
import M from '../../../../demo/manifest.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COURT_ABI = [
  'function previewClaim(bytes32,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) view returns (bool,uint8,uint8,bytes32,uint256)',
  'function submitClaim(bytes32,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]),address) returns (bytes32,uint8,uint256)',
  'function submitSlashingClaim(bytes32,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]),address) returns (bytes32,uint256)',
  'function claimIdOf(uint64,uint64,uint64) pure returns (bytes32)',
  'function claim(bytes32) view returns ((bytes32,bytes32,bytes32,uint64,uint64,uint64,address,bytes4,uint64,uint64,uint8,uint256,address,uint64))',
  'event ClaimRuled(bytes32 indexed claimId, bytes32 indexed operatorId, bytes32 indexed coverageId, uint8 verdict, address target, bytes4 selector, uint64 gasUsed, uint64 gasLimit, uint256 slashed, address beneficiary)',
  'event SlashRefused(bytes32 indexed claimId, bytes32 indexed operatorId, bytes4 reason, uint64 gasUsed, uint64 gasLimit)',
  'event BondSlashed(bytes32 indexed operatorId, bytes32 indexed coverageId, uint256 amount, uint256 remaining)',
  'error NotSlashableExplicitRevert(uint64,uint64)',
  'error OutOfScope(uint8,address,bytes4,uint64)',
  'error AlreadyClaimed(bytes32)',
  'error SourceTransactionSucceeded(uint8)',
];
const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];
const MISS = ['None', 'ChainKey', 'Window', 'Target', 'Selector', 'Operator', 'Revoked', 'Expired', 'Exhausted'];
const iface = new Interface(COURT_ABI);

const bad = (msg: string, code = 400) => Response.json({ ok: false, error: msg }, { status: code });

export async function POST(req: Request) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) return bad('relayer not configured', 503);

  let body: any;
  try { body = await req.json(); } catch { return bad('bad json'); }
  const { sourceTx, shape, beneficiary } = body ?? {};

  // Only evidence from the pool. The relayer will not fetch arbitrary transactions on request.
  const pool = (M as any).evidencePool?.items ?? [];
  const item = pool.find((i: any) => i.txHash?.toLowerCase() === String(sourceTx ?? '').toLowerCase());
  if (!item) return bad('unknown evidence: not in the pre-attested pool');
  if (shape !== 'record' && shape !== 'slash') return bad('shape must be "record" or "slash"');

  let ben: string;
  try { ben = getAddress(String(beneficiary)); }
  catch { return bad('beneficiary is not a checksummed address'); }
  if (!isAddress(ben)) return bad('beneficiary is not an address');

  const chainKey = (M as any).operator.chainKey as number;
  const rpc = new JsonRpcProvider((M as any).chains.cc3.rpc, (M as any).chains.cc3.chainId, { staticNetwork: true });
  const wallet = new Wallet(key, rpc);
  const court = new Contract((M as any).contracts.arrearsCourt.address, COURT_ABI, wallet);

  // proof
  let d: any;
  try {
    const r = await fetch(`${(M as any).prover}/api/v1/proof-by-tx/${chainKey}/${item.txHash}`);
    if (!r.ok) return bad(`prover ${r.status}`, 502);
    const j = await r.json();
    d = j.data ?? j;
  } catch (e: any) { return bad(`prover unreachable: ${e.message}`, 502); }

  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  const height = Number(d.headerNumber);
  const opId = (M as any).operator.operatorId;

  // Already ruled? Answer cheaply instead of burning gas on AlreadyClaimed.
  const claimId = await court.claimIdOf(chainKey, height, Number(d.txIndex));
  const existing = await court.claim(claimId);
  if (Number(existing[13]) !== 0) {
    return Response.json({ ok: false, alreadyRuled: true, claimId,
      error: 'this evidence has already been ruled on' }, { status: 409 });
  }

  // Preview before spending. This is the griefing bound: the relayer never pays for a claim
  // that would not land, and it costs nothing to find out.
  let pv: any;
  try { pv = await court.previewClaim(opId, height, d.txBytes, mp, cp); }
  catch (e: any) { return bad(`preview failed: ${e.shortMessage ?? e.message}`, 502); }
  const verdict = VERDICT[Number(pv[1])];
  const miss = MISS[Number(pv[2])];
  if (!pv[0]) return bad('proof did not verify', 422);
  if (miss !== 'None') {
    return Response.json({ ok: false, refusedBeforeSubmit: true, miss,
      error: `out of scope: ${miss}` }, { status: 422 });
  }
  if (shape === 'slash' && verdict !== 'OutOfGas') {
    // The strict path would revert. Say so for free rather than mining a failure.
    return Response.json({ ok: false, refusedBeforeSubmit: true, verdict,
      namedError: 'NotSlashableExplicitRevert',
      error: 'the strict path refuses this: it is not an out-of-gas failure' }, { status: 422 });
  }

  try {
    const fn = shape === 'slash' ? 'submitSlashingClaim' : 'submitClaim';
    const tx = await court[fn](opId, height, d.txBytes, mp, cp, ben, { gasLimit: 3_000_000 });
    const rc = await tx.wait();

    let ruled: any = null, refused: any = null, slashed: any = null;
    for (const l of rc.logs) {
      try {
        const p = iface.parseLog(l);
        if (p?.name === 'ClaimRuled') ruled = p;
        if (p?.name === 'SlashRefused') refused = p;
        if (p?.name === 'BondSlashed') slashed = p;
      } catch { /* not ours */ }
    }
    return Response.json({
      ok: true, hash: rc.hash, status: rc.status, gasUsed: String(rc.gasUsed),
      predicted: { verdict, wouldSlashWei: pv[4].toString(), coverageId: pv[3] },
      result: ruled ? {
        verdict: VERDICT[Number(ruled.args.verdict)],
        slashedWei: ruled.args.slashed.toString(),
        beneficiary: ruled.args.beneficiary,
        claimId: ruled.args.claimId,
      } : null,
      refusal: refused ? {
        reasonSelector: refused.args.reason,
        namedError: 'NotSlashableExplicitRevert',
        gasUsed: String(refused.args.gasUsed), gasLimit: String(refused.args.gasLimit),
      } : null,
      bondSlashed: slashed ? {
        amountWei: slashed.args.amount.toString(), remainingWei: slashed.args.remaining.toString(),
      } : null,
      explorer: `${(M as any).chains.cc3.explorer}/tx/${rc.hash}`,
    });
  } catch (e: any) {
    const raw = e?.data ?? e?.info?.error?.data;
    let named: string | null = null;
    try { const err = iface.parseError(raw); named = `${err!.name}(${err!.args.map(String).join(', ')})`; } catch { /* none */ }
    return Response.json({ ok: false, error: named ?? (e.shortMessage ?? e.message), namedError: named }, { status: 500 });
  }
}
