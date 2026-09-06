/** Phase 0 probe 17 — is CC3's estimateGas trustworthy? Replay mined transactions at their
 *  own parent block and compare the estimate against the receipt's actual gasUsed. */
import { JsonRpcProvider } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');

async function main() {
  const head = await CC3.getBlockNumber();
  const samples: any[] = [];
  for (let b = head - 1; b > head - 400 && samples.length < 12; b--) {
    const blk = await CC3.send('eth_getBlockByNumber', ['0x' + b.toString(16), true]);
    for (const t of blk?.transactions ?? []) {
      if (!t.to) continue;
      const rc = await CC3.send('eth_getTransactionReceipt', [t.hash]);
      if (rc?.status !== '0x1') continue;
      samples.push({ t, rc, block: b });
      if (samples.length >= 12) break;
    }
  }
  console.log(`replaying ${samples.length} mined CC3 transactions at their parent block\n`);
  console.log('  actualGasUsed   estimateGas    delta     ratio   to');
  let worst = 0;
  for (const s of samples) {
    const actual = parseInt(s.rc.gasUsed, 16);
    try {
      const est = Number(await CC3.estimateGas({
        to: s.t.to, data: s.t.input, from: s.t.from, value: s.t.value,
        blockTag: '0x' + (s.block - 1).toString(16),
      } as any));
      const ratio = est / actual;
      worst = Math.max(worst, Math.abs(ratio - 1));
      console.log(`  ${String(actual).padStart(13)}  ${String(est).padStart(12)}  ${String(est - actual).padStart(7)}  ${ratio.toFixed(4).padStart(7)}   ${s.t.to.slice(0,14)}...`);
    } catch (e: any) {
      console.log(`  ${String(actual).padStart(13)}  ${'ESTIMATE FAILED'.padStart(12)}          -   ${String(e.shortMessage ?? e.message).slice(0,40)}`);
    }
  }
  console.log(`\n  worst deviation from actual: ${(worst * 100).toFixed(2)}%`);
}
main().catch(e => console.error('FATAL', e.message));
