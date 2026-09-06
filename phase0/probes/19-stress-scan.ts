/** Phase 0 probe 19 — scan each reachable stress window for liquidation cascades and
 *  the failed transactions beside them. Logs are pulled out of receipts because the
 *  public archive RPC refuses wide eth_getLogs. */
import { JsonRpcProvider } from 'ethers';
const ETH = new JsonRpcProvider(process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');

const LIQ: Record<string, string> = {
  '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286': 'Aave LiquidationCall',
  '0x298637f684da70674f26509b10f07ec2fbc77a335ab1e7d6215a4b2484d8bb52': 'Compound LiquidateBorrow',
  '0x85258d09e1e4ef299ff3fc11e74af99563f022d21f3f940db982229dc2a3358c': 'Maker Bark',
  '0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41': 'Morpho Liquidate',
  '0x1547a878dc89ad3c367b6338b4be6a65a5dd74fb77ae044da1e8747ef1f4f62f': 'Compound v3 AbsorbDebt',
};
const WINDOWS: [string, number][] = [
  ['FTX collapse            2022-11-09', 15932331],
  ['USDC depeg (SVB)        2023-03-11', 16804702],
  ['Yen carry unwind        2024-08-05', 20460434],
  ['Feb 2025 selloff        2025-02-03', 21765839],
  ['Oct 2025 cascade        2025-10-10', 23548975],
];
const SPAN = Number(process.env.SPAN ?? 30);
const OFFSETS = [0, 300, 900, 1800, 3600];

async function scan(from: number, n: number) {
  let tx = 0, rev = 0; const liq: Record<string, number> = {}; const fails: any[] = [];
  const hs = Array.from({ length: n }, (_, i) => from + i);
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (true) {
      const i = next++; if (i >= hs.length) return; const b = hs[i];
      let rec: any[], blk: any;
      try { [rec, blk] = await Promise.all([
        ETH.send('eth_getBlockReceipts', ['0x' + b.toString(16)]),
        ETH.send('eth_getBlockByNumber', ['0x' + b.toString(16), true])]); } catch { continue; }
      if (!rec || !blk) continue;
      const byHash = new Map(blk.transactions.map((t: any) => [t.hash, t]));
      tx += rec.length;
      for (const r of rec) {
        for (const l of r.logs) { const nm = LIQ[l.topics[0]]; if (nm) liq[nm] = (liq[nm] ?? 0) + 1; }
        if (r.status !== '0x0') continue;
        rev++;
        const t: any = byHash.get(r.transactionHash);
        const gu = parseInt(r.gasUsed, 16), gl = t ? parseInt(t.gas, 16) : 0;
        fails.push({ hash: r.transactionHash, block: b, to: (r.to ?? '').toLowerCase(),
          sel: t?.input?.slice(0, 10), gasUsed: gu, gasLimit: gl, oog: gl > 0 && gu >= gl });
      }
    }
  }));
  return { tx, rev, liq, fails };
}

async function main() {
  console.log(`scanning ${SPAN} blocks at each of ${OFFSETS.length} offsets per window\n`);
  for (const [name, base] of WINDOWS) {
    console.log(`=== ${name}  base block ${base} ===`);
    let best: any = null;
    for (const off of OFFSETS) {
      const r = await scan(base + off, SPAN);
      const liqTotal = Object.values(r.liq).reduce((a, c) => a + c, 0);
      const rate = r.tx ? (100 * r.rev / r.tx) : 0;
      console.log(`  +${String(off).padStart(4)}  ${String(r.tx).padStart(5)} txs  ${String(r.rev).padStart(4)} reverted (${rate.toFixed(2)}%)  ${String(liqTotal).padStart(3)} liquidations  ${JSON.stringify(r.liq)}`);
      const score = liqTotal * 10 + r.rev;
      if (!best || score > best.score) best = { off, score, ...r, rate };
    }
    if (best) {
      console.log(`  -> peak at +${best.off}: ${best.rev} reverts (${best.rate.toFixed(2)}%), ${Object.values(best.liq).reduce((a:any,c:any)=>a+c,0)} liquidations`);
      const oog = best.fails.filter((f: any) => f.oog);
      console.log(`     out-of-gas failures in that slice: ${oog.length}`);
      for (const f of oog.slice(0, 4)) console.log(`       OOG ${f.hash} blk ${f.block} to ${f.to} sel ${f.sel} gas ${f.gasUsed}/${f.gasLimit}`);
    }
    console.log();
  }
}
main().catch(e => console.error('FATAL', e.message));
