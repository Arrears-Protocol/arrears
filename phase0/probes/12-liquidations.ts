/** Phase 0 probe 12 — find REVERTED Aave liquidation attempts by targeting blocks
 *  where liquidations actually happened (failed races cluster beside successful ones). */
import { JsonRpcProvider } from 'ethers';
const ETH = new JsonRpcProvider(process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');
const AAVE_V3 = '0x87870bCa3F3fD6335C3F4ce8392D69350B4fA4E2';
const LIQ_TOPIC = '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';
const LIQ_SEL = '0x00a718a9'; // liquidationCall(address,address,address,uint256,bool)
const TIP = 25916380;

async function main() {
  // 1. where did liquidations succeed recently?
  let logs: any[] = [];
  for (const span of [5000, 20000, 100000]) {
    try {
      logs = await ETH.send('eth_getLogs', [{
        address: AAVE_V3, topics: [LIQ_TOPIC],
        fromBlock: '0x' + (TIP - span).toString(16), toBlock: '0x' + TIP.toString(16),
      }]);
      console.log(`span ${span} blocks -> ${logs.length} successful LiquidationCall events`);
      if (logs.length) break;
    } catch (e: any) { console.log(`span ${span}: ${String(e.shortMessage ?? e.message).slice(0,90)}`); }
  }
  if (!logs.length) { console.log('no successful liquidations found in range'); return; }

  const blocks = [...new Set(logs.map(l => parseInt(l.blockNumber, 16)))].sort((a,b)=>a-b);
  console.log(`liquidation-active blocks: ${blocks.length}  first=${blocks[0]} last=${blocks[blocks.length-1]}`);
  for (const l of logs.slice(0, 5))
    console.log(`  OK liquidation tx ${l.transactionHash} @ ${parseInt(l.blockNumber,16)}`);

  // 2. scan a window AROUND those blocks for reverted liquidation attempts
  const window = new Set<number>();
  for (const b of blocks) for (let d = -3; d <= 3; d++) window.add(b + d);
  const hs = [...window].filter(h => h <= TIP).sort((a,b)=>a-b);
  console.log(`\nscanning ${hs.length} blocks around them for REVERTED liquidationCall...`);
  const found: any[] = [];
  let next = 0, scanned = 0, revertsSeen = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (true) {
      const i = next++; if (i >= hs.length) return;
      const b = hs[i];
      let rec: any[], blk: any;
      try { [rec, blk] = await Promise.all([
        ETH.send('eth_getBlockReceipts', ['0x'+b.toString(16)]),
        ETH.send('eth_getBlockByNumber', ['0x'+b.toString(16), true])]); } catch { continue; }
      if (!rec || !blk) continue; scanned++;
      const byHash = new Map(blk.transactions.map((t: any) => [t.hash, t]));
      for (const r of rec) {
        if (r.status !== '0x0') continue;
        revertsSeen++;
        const t: any = byHash.get(r.transactionHash);
        const sel = t?.input?.slice(0,10);
        if (sel === LIQ_SEL || (r.to ?? '').toLowerCase() === AAVE_V3.toLowerCase()) {
          found.push({ hash: r.transactionHash, block: b, to: r.to, sel,
            gasUsed: parseInt(r.gasUsed,16), gasLimit: t?parseInt(t.gas,16):0, logs: r.logs.length });
        }
      }
    }
  }));
  console.log(`scanned ${scanned} blocks, ${revertsSeen} reverts total, ${found.length} touching Aave v3`);
  for (const f of found.slice(0, 12)) console.log('  REVERTED ' + JSON.stringify(f));
}
main().catch(e => console.error('FATAL', e.message));
