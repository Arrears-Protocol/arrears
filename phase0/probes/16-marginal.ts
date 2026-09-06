/** Phase 0 probe 16 — isolate the TRUE execution cost of verifyAndEmit by subtracting
 *  exact intrinsic + calldata gas from measured estimateGas across batch sizes. */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const PRE = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
const BATCH = 'verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const iface = new Interface([`function ${BATCH} returns (bool)`, `function ${SINGLE} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 90000);

function cdGas(hex: string) {
  const buf = Buffer.from(hex.slice(2), 'hex');
  let z = 0, nz = 0; for (const x of buf) (x === 0 ? z++ : nz++);
  return { bytes: buf.length, zero: z, nonzero: nz, gas: z * 4 + nz * 16 };
}

async function main() {
  const blk = await ETH.send('eth_getBlockByNumber', ['0x' + (25916354).toString(16), false]);
  const pool: any[] = []; let n = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (true) { const i = n++; if (i >= 30) return;
      try { const r = await b.getProof(blk.transactions[i]); if (r.success) pool.push(r.data); } catch {} }
  }));
  pool.sort((a, c) => a.txBytes.length - c.txBytes.length);
  const cp = [pool[0].continuityProof.lowerEndpointDigest, pool[0].continuityProof.roots];
  console.log(`pool=${pool.length}, using the ${10} smallest, identical continuity proof\n`);

  console.log('  N  calldataB  intrinsic+calldata   estimateGas   EXECUTION   exec/leg');
  const rows: any[] = [];
  for (let k = 1; k <= 10; k++) {
    const sel = Array.from({ length: k }, (_, i) => pool[i]);
    const data = iface.encodeFunctionData(BATCH, [3, sel.map(p => p.headerNumber), sel.map(p => p.txBytes),
      sel.map(p => [p.merkleProof.root, p.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])]), cp]);
    const c = cdGas(data);
    const g = Number(await CC3.estimateGas({ to: PRE, data, from: FROM }));
    const floor = 21000 + c.gas;
    const exec = g - floor;
    rows.push({ k, exec });
    console.log(`  ${String(k).padStart(2)}  ${String(c.bytes).padStart(8)}  ${String(floor).padStart(18)}  ${String(g).padStart(12)}  ${String(exec).padStart(9)}  ${String(Math.round(exec/k)).padStart(8)}`);
  }
  const slope = (rows[9].exec - rows[0].exec) / 9;
  console.log(`\n  marginal EXECUTION cost per additional leg: ${Math.round(slope)} gas`);
  console.log(`  fixed execution overhead of the call:       ${Math.round(rows[0].exec - slope)} gas`);

  // the same for index41's own front-leg proof, single form
  const r = await b.getProof('0xec3777f9d0e55d03b9caa3a4b8a786dd62e16eeb327a9f1c45dfbc79af618436');
  const d: any = r.data;
  const data1 = iface.encodeFunctionData(SINGLE, [3, d.headerNumber, d.txBytes,
    [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])],
    [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots]]);
  const c1 = cdGas(data1);
  const g1 = Number(await CC3.estimateGas({ to: PRE, data: data1, from: FROM }));
  console.log(`\n=== index41's front-leg proof, single verifyAndEmit, direct from an EOA ===`);
  console.log(`  calldata            ${c1.bytes} bytes (${c1.nonzero} nonzero, ${c1.zero} zero)`);
  console.log(`  intrinsic           21,000`);
  console.log(`  calldata gas        ${c1.gas.toLocaleString()}`);
  console.log(`  estimateGas total   ${g1.toLocaleString()}`);
  console.log(`  => EXECUTION        ${(g1 - 21000 - c1.gas).toLocaleString()} gas  <-- the precompile's actual work`);
}
main().catch(e => console.error('FATAL', e.message));
