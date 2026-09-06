/** Phase 0 probe 12b — chunked getLogs to locate Aave v3 liquidations, then hunt reverted attempts. */
import { JsonRpcProvider } from 'ethers';
const LOGS_RPC = new JsonRpcProvider('https://1rpc.io/eth');       // 50-block getLogs windows
const BULK = new JsonRpcProvider('https://ethereum-rpc.publicnode.com'); // receipts near head
const AAVE = '0x87870bCa3F3fD6335C3F4ce8392D69350B4fA4E2';
const TOPIC = '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';
const LIQ_SEL = '0x00a718a9';
const TIP = 25916380;
const SPAN = Number(process.env.SPAN ?? 3000);

async function main() {
  const hits: any[] = [];
  const chunks: number[] = [];
  for (let f = TIP - SPAN; f < TIP; f += 50) chunks.push(f);
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (true) {
      const i = next++; if (i >= chunks.length) return;
      const f = chunks[i], t = Math.min(f + 49, TIP);
      try {
        const l = await LOGS_RPC.send('eth_getLogs', [{ address: AAVE, topics: [TOPIC],
          fromBlock: '0x'+f.toString(16), toBlock: '0x'+t.toString(16) }]);
        if (l?.length) hits.push(...l);
      } catch { /* rate limit, skip */ }
    }
  }));
  console.log(`Aave v3 successful LiquidationCall events in last ${SPAN} blocks: ${hits.length}`);
  const blocks = [...new Set(hits.map(l => parseInt(l.blockNumber, 16)))].sort((a,b)=>a-b);
  console.log(`across ${blocks.length} distinct blocks`);
  for (const l of hits.slice(0,6)) console.log(`  OK  ${l.transactionHash} @ ${parseInt(l.blockNumber,16)}`);
  if (!blocks.length) { console.log('none found in window'); return; }

  const win = new Set<number>();
  for (const b of blocks) for (let d=-2; d<=2; d++) if (b+d<=TIP) win.add(b+d);
  const hs = [...win].sort((a,b)=>a-b);
  console.log(`\nscanning ${hs.length} nearby blocks for REVERTED Aave-touching txs...`);
  const found: any[] = []; let n2 = 0;
  await Promise.all(Array.from({length:8}, async () => {
    while (true) {
      const i = n2++; if (i>=hs.length) return; const b = hs[i];
      let rec:any[], blk:any;
      try { [rec,blk] = await Promise.all([
        BULK.send('eth_getBlockReceipts',['0x'+b.toString(16)]),
        BULK.send('eth_getBlockByNumber',['0x'+b.toString(16),true])]); } catch { continue; }
      if(!rec||!blk) continue;
      const byHash = new Map(blk.transactions.map((t:any)=>[t.hash,t]));
      for (const r of rec) {
        if (r.status!=='0x0') continue;
        const t:any = byHash.get(r.transactionHash); const sel = t?.input?.slice(0,10);
        const touches = (r.to??'').toLowerCase()===AAVE.toLowerCase() || sel===LIQ_SEL;
        if (touches) found.push({hash:r.transactionHash,block:b,to:r.to,sel,
          gasUsed:parseInt(r.gasUsed,16),gasLimit:t?parseInt(t.gas,16):0,logs:r.logs.length});
      }
    }
  }));
  console.log(`REVERTED txs touching Aave v3 near liquidation activity: ${found.length}`);
  for (const f of found.slice(0,12)) console.log('  ' + JSON.stringify(f));
}
main().catch(e=>console.error('FATAL',e.message));
