/** Phase 0 probe 18 — locate historical Ethereum stress windows by date, and test whether
 *  archive receipts are reachable there at all. */
import { JsonRpcProvider } from 'ethers';
const ETH = new JsonRpcProvider(process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');

const EVENTS: [string, string][] = [
  ['2020-03-12T12:00:00Z', 'Black Thursday - COVID crash, MakerDAO zero-bid liquidations'],
  ['2021-05-19T12:00:00Z', 'May 2021 crash'],
  ['2022-05-11T12:00:00Z', 'UST/LUNA collapse'],
  ['2022-06-13T12:00:00Z', 'stETH depeg / Celsius freeze'],
  ['2022-11-09T12:00:00Z', 'FTX collapse'],
  ['2023-03-11T12:00:00Z', 'USDC depeg (SVB)'],
  ['2024-08-05T06:00:00Z', 'Yen carry unwind'],
  ['2025-02-03T12:00:00Z', 'Feb 2025 selloff'],
  ['2025-10-10T18:00:00Z', 'Oct 2025 liquidation cascade'],
];

const EARLIEST = Number(process.env.EARLIEST ?? 15_500_000);
async function blockAtTime(target: number, lo: number, hi: number): Promise<number> {
  lo = Math.max(lo, EARLIEST);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const b = await ETH.send('eth_getBlockByNumber', ['0x' + mid.toString(16), false]);
    if (!b) return lo;
    if (parseInt(b.timestamp, 16) < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

async function main() {
  const head = await ETH.getBlockNumber();
  const hb = await ETH.send('eth_getBlockByNumber', ['0x' + head.toString(16), false]);
  console.log(`mainnet head ${head} @ ${new Date(parseInt(hb.timestamp,16)*1000).toISOString()}\n`);

  console.log('date                       block        event');
  const located: any[] = [];
  for (const [iso, name] of EVENTS) {
    const t = Math.floor(new Date(iso).getTime() / 1000);
    if (t > parseInt(hb.timestamp, 16)) { console.log(`${iso}  (future)     ${name}`); continue; }
    let b: number;
    try { b = await blockAtTime(t, 1, head); } catch { console.log(`${iso}  PRUNED       ${name}`); continue; }
    located.push({ iso, block: b, name });
    console.log(`${iso}  ${String(b).padStart(9)}    ${name}`);
  }

  console.log('\n--- archive reachability at each window (eth_getBlockReceipts) ---');
  for (const l of located) {
    try {
      const r = await ETH.send('eth_getBlockReceipts', ['0x' + l.block.toString(16)]);
      const rev = (r ?? []).filter((x: any) => x.status === '0x0').length;
      console.log(`  ${String(l.block).padStart(9)}  ${String((r??[]).length).padStart(4)} txs, ${String(rev).padStart(3)} reverted (${(100*rev/Math.max(1,(r??[]).length)).toFixed(1)}%)  ${l.name}`);
    } catch (e: any) {
      console.log(`  ${String(l.block).padStart(9)}  UNREACHABLE: ${String(e.shortMessage ?? e.message).slice(0,60)}  ${l.name}`);
    }
  }
}
main().catch(e => console.error('FATAL', e.message));
