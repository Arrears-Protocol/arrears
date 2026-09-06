/** Phase 0 probe 37 — wait for the pool to attest, verify each item proves and classifies
 *  as intended, then fold it into demo/manifest.json. Anything that does not verify is
 *  dropped rather than shipped. */
import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { proofProvider, chainInfo } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const KEY = 1;
const P = JSON.parse(readFileSync('evidence/35-evidence-pool.json', 'utf8'));
const C = JSON.parse(readFileSync('evidence/36-demo-coverage.json', 'utf8'));
const D = JSON.parse(readFileSync('evidence/31-deploy-protocol.json', 'utf8'));
const abi = (n: string) => JSON.parse(readFileSync(`../contracts/out/${n}.sol/${n}.json`, 'utf8')).abi;
const court = new Contract(D.court, abi('ArrearsCourt'), CC3);
const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];
const MISS = ['None', 'ChainKey', 'Window', 'Target', 'Selector', 'Operator', 'Revoked', 'Expired', 'Exhausted'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  console.log(`waiting for Sepolia ${P.maxBlock} to attest...`);
  for (let i = 0; i < 100; i++) {
    const tip = await info.getLatestAttestedHeightAndHash(KEY);
    if (tip.height >= P.maxBlock) { console.log(`  attested (tip ${tip.height})`); break; }
    if (i % 5 === 0) console.log(`  tip ${tip.height}, ${P.maxBlock - tip.height} behind`);
    await sleep(15000);
  }

  const b = new proofProvider.service.ProofBuilder(KEY, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  const good: any[] = [], dropped: any[] = [];
  let n = 0;
  const POOL = 6;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (true) {
      const i = n++; if (i >= P.items.length) return;
      const it = P.items[i];
      try {
        const r = await b.getProof(it.txHash);
        if (!r.success) { dropped.push({ ...it, why: 'proof unavailable' }); process.stdout.write('p'); continue; }
        const d: any = r.data;
        const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
        const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
        const pv = await court.previewClaim(D.operatorId, d.headerNumber, d.txBytes, mp, cp);
        const verdict = VERDICT[Number(pv[1])], miss = MISS[Number(pv[2])];
        if (verdict !== it.kind) { dropped.push({ ...it, why: `classified ${verdict}` }); process.stdout.write('X'); continue; }
        if (miss !== 'None') { dropped.push({ ...it, why: `out of scope: ${miss}` }); process.stdout.write('s'); continue; }
        const already = Number((await court.claim(await court.claimIdOf(KEY, d.headerNumber, d.txIndex))).ruledAt);
        if (already !== 0) { dropped.push({ ...it, why: 'already ruled' }); process.stdout.write('r'); continue; }
        good.push({ kind: it.kind, txHash: it.txHash, block: it.block, txIndex: Number(d.txIndex),
          gasUsed: it.gasUsed, gasLimit: it.gasLimit, selector: it.selector, selectorName: it.selectorName,
          label: it.label, contRoots: d.continuityProof.roots.length,
          wouldSlashWei: pv[4].toString(), coverageId: pv[3] });
        process.stdout.write('.');
      } catch (e: any) { dropped.push({ ...it, why: String(e.message).slice(0, 60) }); process.stdout.write('!'); }
    }
  }));
  console.log('\n');
  const byKind: Record<string, number> = {};
  for (const g of good) byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
  console.log(`verified ${good.length}/${P.items.length}: ${JSON.stringify(byKind)}`);
  if (dropped.length) { console.log(`dropped ${dropped.length}:`); for (const d of dropped.slice(0, 6)) console.log(`  ${d.txHash?.slice(0,18)} — ${d.why}`); }

  const MP = '../demo/manifest.json';
  const m = JSON.parse(readFileSync(MP, 'utf8'));
  m.contracts.arrearsRegistry = m.contracts.arrearsRegistry ?? {};
  m.operator.coverages.push({
    id: C.coverageC, target: C.target, targetName: 'Sepolia WETH9',
    selector: C.selector, selectorName: C.selectorName,
    fromHeight: C.fromHeight, toHeight: C.toHeight, tx: C.declareTx,
    perClaimCapWei: C.perClaimCapWei,
    note: 'The interactive demo coverage. A deliberately small per-claim cap on a selector no other coverage names -- the court takes the widest payable, so sharing a selector with a larger cap would drain the real coverage instead.',
  });
  m.evidencePool = {
    note: 'Pre-produced and pre-attested so nothing in the demo waits on a chain. Real WETH9 calls that fail for ordinary reasons: an under-provisioned gas limit, or a zero balance.',
    target: P.target, operator: P.operator,
    maxInteractiveSlashes: C.maxInteractiveSlashes,
    counts: byKind,
    items: good,
  };
  writeFileSync(MP, JSON.stringify(m, null, 2));
  writeFileSync('evidence/37-pool-verified.json', JSON.stringify({ verified: good.length, dropped }, null, 2));
  console.log(`\nmanifest.evidencePool written: ${good.length} items, ${C.maxInteractiveSlashes} slashes affordable`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
