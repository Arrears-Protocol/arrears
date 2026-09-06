/** Verify the relayer works in PRODUCTION, not just locally.
 *  Vercel's runtime resolves environment variables differently from a local shell, and a
 *  custom domain adds another hop, so this must be exercised against the deployed origin. */
import { readFileSync } from 'node:fs';

const BASE = process.argv[2];
if (!BASE) { console.error('usage: prod-claim.ts <base-url>'); process.exit(1); }
const M = JSON.parse(readFileSync('../demo/manifest.json', 'utf8'));
const BEN = '0x000000000000000000000000000000000000dEaD';

const post = (body: any) =>
  fetch(`${BASE}/api/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

(async () => {
  let bad = 0;
  const ck = (ok: boolean, label: string, detail = '') => { if (!ok) bad++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

  console.log(`origin: ${BASE}\n`);
  const v = await fetch(`${BASE}/api/version`).then((r) => r.json());
  console.log('=== /api/version ==='); console.log(JSON.stringify(v, null, 2));
  ck(v.gitLinked === true, 'gitLinked is true (Vercel project IS linked to GitHub)');
  ck(v.relayerConfigured === true, 'relayerConfigured is true (env var reaches the runtime)');

  // Pick evidence that has NOT been ruled on. An earlier run consumes items, and a test that
  // always picks the first one reports the replay guard as a failure.
  const { JsonRpcProvider, Contract, AbiCoder, keccak256 } = await import('ethers');
  const rpc = new JsonRpcProvider(M.chains.cc3.rpc, undefined, { staticNetwork: true });
  const court = new Contract(M.contracts.arrearsCourt.address,
    ['function claimsAgainst(bytes32) view returns (bytes32[])'], rpc);
  const ruled = new Set(((await court.claimsAgainst(M.operator.operatorId)) as string[]).map((x) => x.toLowerCase()));
  const idFor = (h: number, i: number) => keccak256(
    AbiCoder.defaultAbiCoder().encode(['uint64','uint64','uint64'], [M.operator.chainKey, h, i])).toLowerCase();
  const unruled = (k: string) => M.evidencePool.items
    .filter((i: any) => i.kind === k && !ruled.has(idFor(i.block, i.txIndex)));
  console.log(`\nunruled evidence: ${unruled('OutOfGas').length} out-of-gas, ${unruled('ExplicitRevert').length} explicit revert`);

  // A PREVIEW, in production: refused before spending anything.
  console.log('\n=== 1. preview-equivalent: the relayer refuses without spending ===');
  const rev = unruled('ExplicitRevert')[0];
  const r1 = await post({ sourceTx: rev.txHash, shape: 'slash', beneficiary: BEN });
  ck(r1.json?.refusedBeforeSubmit === true, 'strict on an explicit revert is refused pre-submit',
     r1.json?.namedError ?? r1.json?.error);

  // A REAL sponsored claim, in production.
  console.log('\n=== 2. a real sponsored claim, from the deployed origin ===');
  const oog = unruled('OutOfGas')[0];
  const r2 = await post({ sourceTx: oog.txHash, shape: 'record', beneficiary: BEN });
  const j = r2.json;
  ck(j?.ok === true, 'claim submitted and mined', j?.error);
  if (j?.ok) {
    ck(j.status === 1, 'status 1');
    ck(j.predicted?.verdict === j.result?.verdict, 'prediction matches the ruling',
       `${j.predicted?.verdict} = ${j.result?.verdict}`);
    ck(j.result?.beneficiary?.toLowerCase() === BEN.toLowerCase(), 'the beneficiary we asked for was credited');
    console.log(`\n  verdict   ${j.result?.verdict}`);
    console.log(`  slashed   ${j.result?.slashedWei} wei`);
    console.log(`  gas       ${j.gasUsed}`);
    console.log(`  explorer  ${j.explorer}`);
  }
  console.log(bad === 0 ? '\n  RELAYER WORKS IN PRODUCTION' : `\n  ${bad} FAILED`);
  process.exit(bad ? 1 : 0);
})();
