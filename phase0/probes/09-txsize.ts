/** Phase 0 probe 09 — what actually bounds one CC3 transaction: gas, or extrinsic size? */
import { JsonRpcProvider } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030';
const SINK = '0x000000000000000000000000000000000000dEaD';

async function tryBytes(n: number) {
  // realistic proof-like payload: ~72% non-zero, as measured on real proofs
  let hex = '0x';
  for (let i = 0; i < n; i++) hex += ((i * 37) % 256 === 0 ? 0 : (i * 37) % 256).toString(16).padStart(2, '0');
  try {
    const g = await CC3.estimateGas({ to: SINK, data: hex, from: FROM });
    return { ok: true, gas: g };
  } catch (e: any) { return { ok: false, err: String(e.shortMessage ?? e.message).slice(0, 100) }; }
}

async function main() {
  const blk = await CC3.getBlock('latest');
  console.log(`CC3 head=${blk?.number} gasLimit=${blk?.gasLimit}`);
  console.log('\ncalldata size sweep (to a plain address — isolates size/gas from precompile logic):');
  let lastOk = 0;
  for (const n of [1_000, 10_000, 50_000, 100_000, 200_000, 400_000, 800_000, 1_600_000, 3_200_000]) {
    const r: any = await tryBytes(n);
    if (r.ok) { lastOk = n; console.log(`  ${String(n).padStart(9)} bytes -> gas ${String(r.gas).padStart(11)}  (${(Number(r.gas)*100/75e6).toFixed(2)}% of cap)  OK`); }
    else console.log(`  ${String(n).padStart(9)} bytes -> FAIL: ${r.err}`);
  }
  console.log(`\nlargest calldata that estimated OK: ${lastOk} bytes`);
  // gas-per-byte regression on real numbers
  const a: any = await tryBytes(10_000), c: any = await tryBytes(100_000);
  if (a.ok && c.ok) {
    const slope = (Number(c.gas) - Number(a.gas)) / 90_000;
    const intercept = Number(a.gas) - slope * 10_000;
    console.log(`gas model: gas ~= ${Math.round(intercept)} + ${slope.toFixed(2)} * calldataBytes`);
    console.log(`=> calldata bytes affordable within 75,000,000 gas: ${Math.floor((75e6 - intercept) / slope).toLocaleString()}`);
  }
}
main().catch(e => console.error('FATAL', e.message));
