/** Phase 0 probe 08 — pin the exact batch limit, and test whether it is a length cap or a size cap. */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver, utils } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const PRE = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
const BATCH = 'verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';
const VBATCH = 'verify(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';
const iface = new Interface([`function ${BATCH} returns (bool)`, `function ${VBATCH} view returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 90000);
const BLOCK = 25916354;

async function main() {
  const blk = await ETH.send('eth_getBlockByNumber', ['0x' + BLOCK.toString(16), false]);
  // choose the SMALLEST transactions so size never confounds the length test
  const cand: any[] = [];
  let next = 0; const hashes: string[] = blk.transactions;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (true) { const i = next++; if (i >= 40) return;
      try { const r = await b.getProof(hashes[i]); if (r.success) cand.push(r.data); } catch {} }
  }));
  cand.sort((a, c) => a.txBytes.length - c.txBytes.length);
  const cp = [cand[0].continuityProof.lowerEndpointDigest, cand[0].continuityProof.roots];
  console.log(`pool=${cand.length}  smallest txBytes=${(cand[0].txBytes.length-2)/2}\n`);

  const build = (n: number, fn: string) => {
    const sel = Array.from({ length: n }, (_, i) => cand[i % cand.length]);
    return iface.encodeFunctionData(fn, [3, sel.map(p => p.headerNumber), sel.map(p => p.txBytes),
      sel.map(p => [p.merkleProof.root, p.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])]), cp]);
  };

  console.log('--- verifyAndEmit (state-changing), smallest txs, N=1..14 ---');
  for (let n = 1; n <= 14; n++) {
    const data = build(n, BATCH); const bytes = (data.length - 2) / 2;
    try {
      const g = await CC3.estimateGas({ to: PRE, data, from: FROM });
      console.log(`  N=${String(n).padStart(2)} calldata=${String(bytes).padStart(6)} gas=${String(g).padStart(9)} (${(Number(g)*100/75e6).toFixed(3)}% of cap)  OK`);
    } catch (e: any) {
      console.log(`  N=${String(n).padStart(2)} calldata=${String(bytes).padStart(6)} FAIL: ${String(e.shortMessage ?? e.message).slice(0,80)}`);
    }
  }
  console.log('\n--- verify (view, free) same sweep — is the cap on both forms? ---');
  for (let n = 6; n <= 12; n++) {
    const data = build(n, VBATCH);
    try { const r = await CC3.call({ to: PRE, data, from: FROM }); console.log(`  N=${String(n).padStart(2)} -> ${r.slice(0,10)}... OK`); }
    catch (e: any) { console.log(`  N=${String(n).padStart(2)} FAIL: ${String(e.shortMessage ?? e.message).slice(0,80)}`); }
  }
}
main().catch(e => console.error('FATAL', e.message));
