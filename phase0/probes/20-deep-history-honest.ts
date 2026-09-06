/** Phase 0 probe 20 — RETEST deep history with ARBITRARY (non-checkpoint-aligned) heights.
 *  Probe 06 used round numbers, which land exactly on checkpoints. That was a confound. */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver, chainInfo } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const iface = new Interface([`function ${SINGLE} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);
const info = new chainInfo.PrecompileChainInfoProvider(CC3);

function cdGas(hex: string) {
  const buf = Buffer.from(hex.slice(2), 'hex'); let z=0,nz=0;
  for (const x of buf) (x===0?z++:nz++); return { bytes: buf.length, gas: z*4+nz*16 };
}

// deliberately awkward heights: NOT multiples of 10/100/1000
const HEIGHTS = [
  25916357, 25916301, 25915777, 25900537, 25800123, 25500777,
  25000437, 23000851, 20123456, 15555555, 12345678, 10000437, 5000321, 1000777, 400013,
];

async function main() {
  console.log('height      cp-bounds(parent..child)  span  contRoots  txBytes  calldata     gas   gas/leg-vs-recent');
  const rows: any[] = [];
  for (const h of HEIGHTS) {
    let bounds: any = null;
    try { bounds = await info.getContinuityBounds(3, h); } catch {}
    const blk = await ETH.send('eth_getBlockByNumber', ['0x' + h.toString(16), false]).catch(() => null);
    if (!blk?.transactions?.length) {
      console.log(`${String(h).padStart(9)}  ${bounds ? `${bounds.parentHeight}..${bounds.childHeight}`.padEnd(24) : 'n/a'.padEnd(24)}  ${bounds?String(bounds.childHeight-bounds.parentHeight).padStart(4):'   -'}  (no mainnet block data - pruned RPC)`);
      continue;
    }
    const txh = blk.transactions[Math.min(1, blk.transactions.length - 1)];
    try {
      const r = await b.getProof(txh);
      if (!r.success) { console.log(`${String(h).padStart(9)}  proof refused`); continue; }
      const d: any = r.data;
      const data = iface.encodeFunctionData(SINGLE, [3, d.headerNumber, d.txBytes,
        [d.merkleProof.root, d.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])],
        [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots]]);
      const c = cdGas(data);
      const g = Number(await CC3.estimateGas({ to: blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS, data, from: FROM }));
      const exec = g - 21000 - c.gas;
      rows.push({ h, roots: d.continuityProof.roots.length, gas: g, exec });
      console.log(`${String(h).padStart(9)}  ${(bounds?`${bounds.parentHeight}..${bounds.childHeight}`:'n/a').padEnd(24)}  ${bounds?String(bounds.childHeight-bounds.parentHeight).padStart(4):'   -'}  ${String(d.continuityProof.roots.length).padStart(9)}  ${String((d.txBytes.length-2)/2).padStart(7)}  ${String(c.bytes).padStart(8)}  ${String(g).padStart(7)}  exec=${exec}`);
    } catch (e: any) {
      console.log(`${String(h).padStart(9)}  ERROR ${String(e.message).slice(0,70)}`);
    }
  }
  if (rows.length > 1) {
    console.log('\ncontinuity roots vs execution gas:');
    for (const r of rows.sort((a,c)=>a.roots-c.roots)) console.log(`  roots=${String(r.roots).padStart(4)}  exec=${String(r.exec).padStart(8)}  total=${String(r.gas).padStart(8)}  (h=${r.h})`);
  }
}
main().catch(e => console.error('FATAL', e.message));
