/** Phase 0 probe 07 — the measured ceiling: how many verifyAndEmit fit in ONE CC3 transaction? */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver, utils } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const PRE = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
const BATCH = 'verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';
const iface = new Interface([`function ${BATCH} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 90000);

const BLOCK = Number(process.env.BLOCK ?? 25916354);

async function main() {
  const blk = await ETH.send('eth_getBlockByNumber', ['0x' + BLOCK.toString(16), false]);
  const hashes: string[] = blk.transactions;
  console.log(`mainnet block ${BLOCK}: ${hashes.length} txs`);

  // pull proofs concurrently (bounded)
  const want = Math.min(Number(process.env.WANT ?? 64), hashes.length);
  const proofs: any[] = [];
  const POOL = 8;
  let next = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (true) {
      const i = next++;
      if (i >= want) return;
      try { const r = await b.getProof(hashes[i]); if (r.success) proofs[i] = r.data; } catch {}
    }
  }));
  const got = proofs.filter(Boolean);
  console.log(`fetched ${got.length} proofs`);
  const cp = [got[0].continuityProof.lowerEndpointDigest, got[0].continuityProof.roots];
  const allSameCp = got.every(p => JSON.stringify(p.continuityProof) === JSON.stringify(got[0].continuityProof));
  console.log(`all share one continuity proof: ${allSameCp}  (roots=${got[0].continuityProof.roots.length})`);
  const sizes = got.map(p => (p.txBytes.length - 2) / 2);
  console.log(`txBytes: min=${Math.min(...sizes)} max=${Math.max(...sizes)} mean=${Math.round(sizes.reduce((a,c)=>a+c,0)/sizes.length)}`);

  console.log(`\n N   calldataBytes      estimateGas    %ofCap   gas/leg    result`);
  let lastOk = 0;
  for (const n of [1,2,4,8,12,16,24,32,48,64].filter(n => n <= got.length)) {
    const sel = got.slice(0, n);
    const data = iface.encodeFunctionData(BATCH, [
      3, sel.map(p => p.headerNumber), sel.map(p => p.txBytes),
      sel.map(p => [p.merkleProof.root, p.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])]), cp,
    ]);
    const bytes = (data.length - 2) / 2;
    let out = '';
    try {
      const g = await CC3.estimateGas({ to: PRE, data, from: FROM });
      const pct = (Number(g) * 100 / Number(utils.gas.MAX_GAS_CAP)).toFixed(3);
      out = `${String(bytes).padStart(10)}  ${String(g).padStart(12)}  ${pct.padStart(7)}%  ${String(Math.round(Number(g)/n)).padStart(8)}   OK`;
      lastOk = n;
    } catch (e: any) {
      out = `${String(bytes).padStart(10)}  ${''.padStart(12)}  ${''.padStart(8)}  ${''.padStart(8)}   FAIL: ${String(e.shortMessage ?? e.message).slice(0,90)}`;
    }
    console.log(`${String(n).padStart(3)} ${out}`);
  }
  console.log(`\nlargest batch that estimated OK: ${lastOk}`);
}
main().catch(e => console.error('FATAL', e.message));
