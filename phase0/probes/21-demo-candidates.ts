/** Phase 0 probe 21 — for each named historical failure, generate the proof and measure
 *  what it actually costs to prove on CC3. This is the demo shortlist. */
import { JsonRpcProvider, Interface } from 'ethers';
import { proofProvider, blockProver } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const iface = new Interface([`function ${SINGLE} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);

const CANDIDATES: [string, string, string][] = [
  ['USDC depeg (SVB) 2023-03-11', '0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096', 'Uniswap V2 Router swapExactTokensForETHSupportingFee - OUT OF GAS 324,239/324,239'],
  ['USDC depeg (SVB) 2023-03-11', '0x1dd76820f55cc790a57ed33eee30ed25d120f6f0820a89c1f55a6c2dc7e71c22', 'OUT OF GAS 77,600/77,600'],
  ['Yen carry unwind 2024-08-05', '0x252a53c5d5fa0706ba15624c62db62300708eb9dbe14454af7a73f8fed6625e4', 'OUT OF GAS 134,138/134,138'],
  ['Yen carry unwind 2024-08-05', '0xbf4a64126832f98707b723de0bc68b5883144313d5e8f2cb627847193aa206d0', 'USDT transfer OUT OF GAS 76,808/76,808'],
  ['Feb 2025 selloff 2025-02-03', '0x3198a097f62d37dc2463b87adf87419621a8bf45e014491c0f9911aa09224fcc', 'OUT OF GAS 134,482/134,482'],
  ['Oct 2025 cascade 2025-10-10', '0x27cb58551d34f7b1a48fabdbfc8ca078a2e7aaf0bed52b425a980cd11d4a967c', 'USDT transfer OUT OF GAS 120,000/120,000'],
  ['Oct 2025 cascade 2025-10-10', '0xee76fbbb8fe207a1af967a751dd5dd2c0b3fb6ae3f061ec108fc13d12df3c756', 'USDT transfer OUT OF GAS 80,000/80,000'],
];

function cdGas(hex: string) {
  const buf = Buffer.from(hex.slice(2),'hex'); let z=0,nz=0;
  for (const x of buf) (x===0?z++:nz++); return { bytes: buf.length, gas: z*4+nz*16 };
}

async function main() {
  console.log('Proving named historical failures. All are out-of-gas => slashable class.\n');
  const out: any[] = [];
  for (const [win, hash, note] of CANDIDATES) {
    const rc = await ETH.send('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (!rc) { console.log(`${win}\n  ${hash}\n  receipt unavailable\n`); continue; }
    const h = parseInt(rc.blockNumber, 16);
    const blk = await ETH.send('eth_getBlockByNumber', ['0x'+h.toString(16), false]);
    const ts = new Date(parseInt(blk.timestamp,16)*1000).toISOString().slice(0,10);
    let line = `${win}\n  tx      ${hash}\n  block   ${h}  (${ts})   ${note}\n  status  ${rc.status}  logs ${rc.logs.length}`;
    try {
      const r = await b.getProof(hash);
      if (!r.success) { console.log(line + `\n  PROOF   refused\n`); continue; }
      const d: any = r.data;
      const data = iface.encodeFunctionData(SINGLE, [3, d.headerNumber, d.txBytes,
        [d.merkleProof.root, d.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])],
        [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots]]);
      const c = cdGas(data);
      const ok = await new blockProver.PrecompileBlockProver(CC3).verifySingle(
        d.chainKey, d.headerNumber, d.txBytes, d.merkleProof, d.continuityProof);
      const g = Number(await CC3.estimateGas({ to: blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS, data, from: FROM }));
      line += `\n  VERIFY  ${ok}   contRoots=${d.continuityProof.roots.length}  txBytes=${(d.txBytes.length-2)/2}`;
      line += `\n  COST    ${g.toLocaleString()} gas  (${(g*100/75e6).toFixed(3)}% of block cap)  calldata ${c.bytes} B`;
      out.push({ win, hash, h, g, roots: d.continuityProof.roots.length, ok });
    } catch (e: any) { line += `\n  ERROR   ${String(e.message).slice(0,90)}`; }
    console.log(line + '\n');
  }
  if (out.length) {
    console.log('=== summary ===');
    for (const o of out) console.log(`  ${String(o.g).padStart(8)} gas  roots=${String(o.roots).padStart(4)}  block ${o.h}  verified=${o.ok}`);
    const g = out.map(o=>o.g);
    console.log(`\n  range ${Math.min(...g).toLocaleString()} - ${Math.max(...g).toLocaleString()} gas`);
    console.log(`  worst case is ${(Math.max(...g)*100/75e6).toFixed(3)}% of the CC3 block gas cap`);
  }
}
main().catch(e => console.error('FATAL', e.message));
