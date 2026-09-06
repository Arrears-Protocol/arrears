/** Phase 0 probe 03 — scan attested mainnet blocks for reverted txs; frequency + candidates. */
import { JsonRpcProvider } from 'ethers';

const ETH = new JsonRpcProvider(process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');
const ATTESTED_TIP = Number(process.env.TIP ?? 25916380);
const N = Number(process.env.N ?? 30);

async function main() {
  const head = await ETH.getBlockNumber();
  console.log(`mainnet head=${head}  attested tip=${ATTESTED_TIP}  lag=${head - ATTESTED_TIP}`);

  let totalTx = 0, totalRevert = 0;
  const candidates: any[] = [];
  const byTarget = new Map<string, number>();

  const start = ATTESTED_TIP - N;
  for (let b = start; b < ATTESTED_TIP; b++) {
    let receipts: any[];
    try {
      receipts = await ETH.send('eth_getBlockReceipts', ['0x' + b.toString(16)]);
    } catch (e: any) { console.log(`block ${b}: ${e.shortMessage ?? e.message}`); continue; }
    if (!receipts) continue;
    totalTx += receipts.length;
    for (const r of receipts) {
      if (r.status === '0x0') {
        totalRevert++;
        const to = (r.to ?? 'CREATE').toLowerCase();
        byTarget.set(to, (byTarget.get(to) ?? 0) + 1);
        candidates.push({
          hash: r.transactionHash, block: b,
          index: parseInt(r.transactionIndex, 16),
          to, gasUsed: parseInt(r.gasUsed, 16),
          logs: r.logs.length, type: r.type,
        });
      }
    }
  }
  console.log(`\nscanned ${N} blocks [${start}..${ATTESTED_TIP - 1}]`);
  console.log(`transactions=${totalTx}  reverted=${totalRevert}  rate=${(100 * totalRevert / totalTx).toFixed(2)}%`);
  console.log(`avg reverted per block = ${(totalRevert / N).toFixed(1)}`);

  console.log(`\n--- reverted txs WITH logs (>=1) — richer evidence ---`);
  for (const c of candidates.filter((c) => c.logs > 0).slice(0, 15)) console.log(JSON.stringify(c));
  console.log(`\n--- reverted txs with ZERO logs (count=${candidates.filter((c) => c.logs === 0).length}) ---`);
  for (const c of candidates.filter((c) => c.logs === 0).slice(0, 8)) console.log(JSON.stringify(c));

  console.log(`\n--- top reverted targets ---`);
  for (const [k, v] of [...byTarget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${v}x  ${k}`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
