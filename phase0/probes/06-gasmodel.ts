/** Phase 0 probe 06 — gas model: what actually drives verifyAndEmit cost? */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver, utils } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const PROVER = 'https://prover.cc3-testnet.creditcoin.network';
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const iface = new Interface([`function ${SINGLE} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, PROVER, 90000);

async function measure(label: string, txHash: string) {
  try {
    const r = await b.getProof(txHash);
    if (!r.success) { console.log(`${label.padEnd(28)} PROOF FAILED`); return null; }
    const d: any = r.data;
    const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
    const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
    const data = iface.encodeFunctionData(SINGLE, [3, d.headerNumber, d.txBytes, mp, cp]);
    const bytes = (data.length - 2) / 2;
    let g = 0n;
    try { g = await CC3.estimateGas({ to: blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS, data, from: FROM }); }
    catch (e: any) { console.log(`${label.padEnd(28)} ESTIMATE FAILED ${e.shortMessage}`); return null; }
    console.log(`${label.padEnd(28)} h=${String(d.headerNumber).padStart(9)} contRoots=${String(d.continuityProof.roots.length).padStart(3)} sibs=${String(d.merkleProof.siblings.length).padStart(2)} txBytes=${String((d.txBytes.length-2)/2).padStart(5)} calldata=${String(bytes).padStart(6)} gas=${String(g).padStart(9)}`);
    return { d, gas: g, bytes };
  } catch (e: any) { console.log(`${label.padEnd(28)} ERR ${String(e.message).slice(0,80)}`); return null; }
}

async function main() {
  console.log(`MAX_GAS_CAP=${utils.gas.MAX_GAS_CAP}  (CC3 live block gasLimit confirmed 75,000,000)\n`);
  console.log('--- calibration: index41 sandwich legs (their measured total 1,092,100 for 3x verifyAndEmit + 3x calculateTxIndex + asserts) ---');
  await measure('index41 front (idx14)', '0xec3777f9d0e55d03b9caa3a4b8a786dd62e16eeb327a9f1c45dfbc79af618436');

  console.log('\n--- our reverted tx ---');
  await measure('reverted 1inch', '0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7');

  console.log('\n--- history depth sweep: does age change continuity length / gas? ---');
  const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
  for (const h of [25916354, 25900000, 25800000, 25500000, 25000000, 23000000, 20000000, 15000000, 10000000, 5000000, 1000000]) {
    const blk = await ETH.send('eth_getBlockByNumber', ['0x' + h.toString(16), false]);
    if (!blk?.transactions?.length) { console.log(`block ${h}: no txs`); continue; }
    await measure(`mainnet block ${h}`, blk.transactions[Math.min(1, blk.transactions.length - 1)]);
  }
}
main().catch(e => console.error('FATAL', e.message));
