/** Phase 0 probe 22 — the ceiling, RECEIPT-BACKED. Send real verifyAndEmit transactions
 *  from an EOA straight to the precompile at N=1..11 and record mined gasUsed. */
import { JsonRpcProvider, Wallet, Interface, formatEther } from 'ethers';
import { readFileSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider, blockProver, utils } from '@gluwa/usc-sdk';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const PRE = blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS;
const BATCH = 'verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))';
const iface = new Interface([`function ${BATCH} returns (bool)`]);
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const BLOCK = 25916354;
const TVERIFIED = '0x8a8df984523447f746ce8bccdb04c87025c708eb62a2d070bdffb8945c8f391e';

function cdGas(hex: string) { const buf = Buffer.from(hex.slice(2),'hex'); let z=0,nz=0; for(const x of buf)(x===0?z++:nz++); return {bytes:buf.length, gas:z*4+nz*16}; }

async function main() {
  console.log(`signer ${w.address}  balance ${formatEther(await CC3.getBalance(w.address))} tCTC\n`);
  const blk = await ETH.send('eth_getBlockByNumber', ['0x' + BLOCK.toString(16), false]);
  const pool: any[] = []; let n = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (true) { const i = n++; if (i >= 30) return;
      try { const r = await b.getProof(blk.transactions[i]); if (r.success) pool.push(r.data); } catch {} }
  }));
  pool.sort((a,c) => a.txBytes.length - c.txBytes.length);
  const cp = [pool[0].continuityProof.lowerEndpointDigest, pool[0].continuityProof.roots];
  console.log(`proof pool ${pool.length}, using the 11 smallest; shared continuity proof (${pool[0].continuityProof.roots.length} roots)\n`);

  const results: any[] = [];
  console.log('  N  calldataB   estimateGas    MINED gasUsed   %ofCap  events   tx');
  for (const N of [1,2,3,5,8,9,10,11]) {
    const sel = Array.from({length:N},(_,i)=>pool[i]);
    const data = iface.encodeFunctionData(BATCH, [3, sel.map(p=>p.headerNumber), sel.map(p=>p.txBytes),
      sel.map(p=>[p.merkleProof.root, p.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])]), cp]);
    const c = cdGas(data);
    let est = 0n, estErr = '';
    try { est = await CC3.estimateGas({ to: PRE, data, from: w.address }); }
    catch (e:any) { estErr = String(e.shortMessage ?? e.message).slice(0,60); }
    try {
      const tx = await w.sendTransaction({ to: PRE, data, gasLimit: est > 0n ? (est*130n)/100n : 2_000_000n });
      const rc = await tx.wait();
      const ev = rc!.logs.filter(l => l.topics[0] === TVERIFIED).length;
      const pct = (Number(rc!.gasUsed)*100/Number(utils.gas.MAX_GAS_CAP)).toFixed(3);
      console.log(`  ${String(N).padStart(2)}  ${String(c.bytes).padStart(8)}  ${String(est||'-').padStart(12)}  ${String(rc!.gasUsed).padStart(14)}  ${pct.padStart(6)}%  ${String(ev).padStart(6)}   ${rc!.hash}`);
      results.push({N, est:Number(est), mined:Number(rc!.gasUsed), events:ev, hash:rc!.hash, status:rc!.status, bytes:c.bytes});
    } catch (e:any) {
      const reason = String(e.shortMessage ?? e.message).slice(0,100);
      console.log(`  ${String(N).padStart(2)}  ${String(c.bytes).padStart(8)}  ${String(est||'-').padStart(12)}  ${'REVERTED'.padStart(14)}          -       -   ${reason}`);
      if (estErr) console.log(`         estimateGas also refused: ${estErr}`);
      results.push({N, reverted:true, reason, estErr});
    }
  }
  console.log('\n--- estimate vs mined ---');
  for (const r of results.filter(x=>!x.reverted))
    console.log(`  N=${String(r.N).padStart(2)}  est=${String(r.est).padStart(8)}  mined=${String(r.mined).padStart(8)}  over-estimate ${((r.est/r.mined-1)*100).toFixed(2)}%  TransactionVerified events=${r.events}`);
  const ok = results.filter(x=>!x.reverted);
  if (ok.length>1) {
    const a=ok[0], z=ok[ok.length-1];
    console.log(`\n  marginal MINED gas per leg: ${Math.round((z.mined-a.mined)/(z.N-a.N))}`);
    console.log(`  N=${z.N} mined ${z.mined.toLocaleString()} = ${(z.mined*100/75e6).toFixed(3)}% of MAX_GAS_CAP`);
  }
  require('node:fs').writeFileSync('evidence/22-ceiling-mined.json', JSON.stringify(results,null,2));
}
main().catch(e => console.error('FATAL', e.message ?? e));
