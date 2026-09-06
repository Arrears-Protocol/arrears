/** Phase 0 probe 10 — survey mainnet for real failure events worth building on. */
import { JsonRpcProvider } from 'ethers';
const ETH = new JsonRpcProvider(process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');
const TIP = Number(process.env.TIP ?? 25916380);
const N = Number(process.env.N ?? 200);

// Known protocol addresses / selectors worth naming.
const NAMES: Record<string, string> = {
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave v3 Pool',
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Aave v2 LendingPool',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch AggregationRouterV6',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch AggregationRouterV5',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap UniversalRouter(old)',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap UniversalRouter',
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'Uniswap v4 PoolManager',
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2',
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': 'LI.FI Diamond',
  '0xc005dc82818d67af737725bd4bf75435d065d239': 'Uniswap v4 (aux)',
  '0x6a000f20005980200259b80c5102003040001068': 'ParaSwap Augustus v6',
  '0xa69babef1ca67a37ffaf7a485dfff3382056e78c': 'CoW Settlement(?)',
  '0x9008d19f58aabd9ed0d60971565aa8510560ab41': 'CoW Protocol GPv2Settlement',
  '0x00000000009e50a7ddb7a7b0e2ee6604fd120e49': 'MEV/keeper bot',
};
const SELECTORS: Record<string, string> = {
  '0x563dd613': 'Aave v3 liquidationCall',
  '0x00a718a9': 'Aave v2 liquidationCall',
  '0xe8eda9df': 'Aave deposit/supply',
  '0x07ed2379': '1inch swap',
  '0x12aa3caf': '1inch swap(v5)',
  '0x3593564c': 'UniversalRouter execute',
  '0x13d79a0b': 'CoW settle',
  '0x5c11d795': 'swapExactTokensForTokensSupportingFee',
  '0x791ac947': 'swapExactTokensForETHSupportingFee',
  '0xa9059cbb': 'ERC20 transfer',
  '0x23b872dd': 'ERC20 transferFrom',
  '0x88bc2ef3': 'liquidate(?)',
  '0xf2b9fdb8': 'supply(?)',
};

async function main() {
  const start = TIP - N;
  console.log(`surveying mainnet blocks [${start}..${TIP - 1}] (${N} blocks, all attested)\n`);
  let totalTx = 0, totalRevert = 0, withLogs = 0;
  const byTarget = new Map<string, number>();
  const bySelector = new Map<string, number>();
  const gasProfile = { oog: 0, explicit: 0 };
  const examples: Record<string, any> = {};
  let blocks = 0;

  const heights = Array.from({ length: N }, (_, i) => start + i);
  const POOL = 10; let next = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (true) {
      const i = next++; if (i >= heights.length) return;
      const b = heights[i];
      let receipts: any[]; let blk: any;
      try {
        [receipts, blk] = await Promise.all([
          ETH.send('eth_getBlockReceipts', ['0x' + b.toString(16)]),
          ETH.send('eth_getBlockByNumber', ['0x' + b.toString(16), true]),
        ]);
      } catch { continue; }
      if (!receipts || !blk) continue;
      blocks++;
      const txByHash = new Map(blk.transactions.map((t: any) => [t.hash, t]));
      totalTx += receipts.length;
      for (const r of receipts) {
        if (r.status !== '0x0') continue;
        totalRevert++;
        if (r.logs.length > 0) withLogs++;
        const to = (r.to ?? 'CREATE').toLowerCase();
        byTarget.set(to, (byTarget.get(to) ?? 0) + 1);
        const t: any = txByHash.get(r.transactionHash);
        const sel = t?.input?.slice(0, 10) ?? '0x';
        bySelector.set(sel, (bySelector.get(sel) ?? 0) + 1);
        const gu = parseInt(r.gasUsed, 16), gl = t ? parseInt(t.gas, 16) : 0;
        if (gl && gu >= gl) gasProfile.oog++; else gasProfile.explicit++;
        const label = NAMES[to] ?? SELECTORS[sel];
        if (label && !examples[label]) examples[label] = { hash: r.transactionHash, block: b, to, sel, gasUsed: gu, gasLimit: gl, logs: r.logs.length };
      }
    }
  }));

  console.log(`blocks scanned      ${blocks}`);
  console.log(`transactions        ${totalTx}`);
  console.log(`reverted            ${totalRevert}  (${(100*totalRevert/totalTx).toFixed(2)}%)  = ${(totalRevert/blocks).toFixed(1)}/block`);
  console.log(`  ...with >=1 log   ${withLogs}   <-- logs survive a revert?`);
  console.log(`  gasUsed>=gasLimit ${gasProfile.oog}  (out-of-gas signature)`);
  console.log(`  gasUsed< gasLimit ${gasProfile.explicit}  (explicit revert)`);
  console.log(`\nextrapolated: ~${Math.round(totalRevert/blocks*7200).toLocaleString()} reverted txs/day on mainnet`);

  console.log(`\n--- top reverted targets ---`);
  for (const [k, v] of [...byTarget.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 15))
    console.log(`  ${String(v).padStart(4)}x  ${k}  ${NAMES[k] ?? ''}`);
  console.log(`\n--- top reverted selectors ---`);
  for (const [k, v] of [...bySelector.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 15))
    console.log(`  ${String(v).padStart(4)}x  ${k}  ${SELECTORS[k] ?? ''}`);
  console.log(`\n--- named examples ---`);
  for (const [k, v] of Object.entries(examples)) console.log(`  ${k}: ${JSON.stringify(v)}`);
}
main().catch(e => console.error('FATAL', e.message));
