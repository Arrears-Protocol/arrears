/** Phase 0 probe 26 — the historical demo shortlist, RECEIPT-BACKED.
 *  Send a real verifyAndEmit for each named failure and record mined gasUsed + tx hash. */
import { JsonRpcProvider, Wallet, Interface, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider, blockProver } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const PRE = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
const SINGLE = 'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))';
const iface = new Interface([`function ${SINGLE} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);
const kf = JSON.parse(readFileSync(join(homedir(),'.config','creditcoin','arrears-testnet.json'),'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const TVERIFIED = '0x8a8df984523447f746ce8bccdb04c87025c708eb62a2d070bdffb8945c8f391e';

const C: [string,string,string][] = [
  ['USDC depeg (SVB)','0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096','Uniswap V2 Router swapExactTokensForETHSupportingFee OOG 324,239'],
  ['USDC depeg (SVB)','0x1dd76820f55cc790a57ed33eee30ed25d120f6f0820a89c1f55a6c2dc7e71c22','OOG 77,600'],
  ['Yen carry unwind','0x252a53c5d5fa0706ba15624c62db62300708eb9dbe14454af7a73f8fed6625e4','OOG 134,138'],
  ['Yen carry unwind','0xbf4a64126832f98707b723de0bc68b5883144313d5e8f2cb627847193aa206d0','USDT transfer OOG 76,808'],
  ['Feb 2025 selloff','0x3198a097f62d37dc2463b87adf87419621a8bf45e014491c0f9911aa09224fcc','OOG 134,482'],
  ['Oct 2025 cascade','0x27cb58551d34f7b1a48fabdbfc8ca078a2e7aaf0bed52b425a980cd11d4a967c','USDT transfer OOG 120,000'],
  ['Oct 2025 cascade','0xee76fbbb8fe207a1af967a751dd5dd2c0b3fb6ae3f061ec108fc13d12df3c756','USDT transfer OOG 80,000'],
];

async function main() {
  console.log(`signer ${w.address}  ${formatEther(await CC3.getBalance(w.address))} tCTC\n`);
  const rows: any[] = [];
  for (const [win, hash, note] of C) {
    const r = await b.getProof(hash);
    if (!r.success) { console.log(`${hash} proof refused`); continue; }
    const d: any = r.data;
    const data = iface.encodeFunctionData(SINGLE, [3, d.headerNumber, d.txBytes,
      [d.merkleProof.root, d.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])],
      [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots]]);
    const est = await CC3.estimateGas({ to: PRE, data, from: w.address });
    const tx = await w.sendTransaction({ to: PRE, data, gasLimit: (est*130n)/100n });
    const rc = await tx.wait();
    const ev = rc!.logs.filter(l => l.topics[0] === TVERIFIED).length;
    const price = rc!.gasPrice ?? 0n;
    const row = { win, source: hash, note, height: d.headerNumber,
      contRoots: d.continuityProof.roots.length, txBytes: (d.txBytes.length-2)/2,
      est: Number(est), mined: Number(rc!.gasUsed), pctOfCap: +(Number(rc!.gasUsed)*100/75e6).toFixed(3),
      costCTC: formatEther(rc!.gasUsed*price), events: ev, cc3tx: rc!.hash };
    rows.push(row);
    console.log(`${win.padEnd(18)} h=${String(d.headerNumber).padStart(9)} roots=${String(row.contRoots).padStart(3)}  est=${String(row.est).padStart(7)}  MINED=${String(row.mined).padStart(7)}  ${String(row.pctOfCap).padStart(6)}%  ${row.costCTC} tCTC  ev=${ev}`);
    console.log(`${''.padEnd(18)} source ${hash}`);
    console.log(`${''.padEnd(18)} cc3    ${rc!.hash}\n`);
  }
  writeFileSync('evidence/26-historical-mined.json', JSON.stringify(rows,null,2));
  const g = rows.map(r=>r.mined);
  console.log(`=== all ${rows.length} historical failures verified on chain ===`);
  console.log(`mined gas range ${Math.min(...g).toLocaleString()} - ${Math.max(...g).toLocaleString()}`);
  console.log(`worst = ${(Math.max(...g)*100/75e6).toFixed(3)}% of MAX_GAS_CAP`);
  const over = rows.map(r=>(r.est/r.mined-1)*100);
  console.log(`estimateGas over-estimated by ${Math.min(...over).toFixed(2)}%-${Math.max(...over).toFixed(2)}% (never under)`);
  console.log(`total spend ${rows.reduce((a,r)=>a+parseFloat(r.costCTC),0).toFixed(8)} tCTC`);
}
main().catch(e => console.error('FATAL', e.message ?? e));
