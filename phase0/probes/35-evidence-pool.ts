/** Phase 0 probe 35 — pre-produce and pre-attest the interactive evidence pool.
 *
 *  Nothing in the demo may wait on attestation, so the interactive claim cannot generate a
 *  failure on demand. This produces the pool up front:
 *    30 x out-of-gas   WETH.approve()  — genuinely under-provisioned (needs 46,434, sent 30,000)
 *    10 x explicit revert WETH.transfer() — real require() failure on a zero balance
 *  All real calls to the real WETH9. None contrived. */
import { JsonRpcProvider, Wallet, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';

const SEP = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const APPROVE = '0x095ea7b3';
const TRANSFER = '0xa9059cbb';
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const op = new Wallet(kf.accounts.operator.privateKey, SEP);
const N_OOG = Number(process.env.N_OOG ?? 30);
const N_REV = Number(process.env.N_REV ?? 10);
const w32 = (n: bigint) => n.toString(16).padStart(64, '0');
const addr32 = (a: string) => a.slice(2).toLowerCase().padStart(64, '0');

async function main() {
  console.log(`operator ${op.address}  ${formatEther(await SEP.getBalance(op.address))} ETH`);
  let nonce = await SEP.getTransactionCount(op.address, 'pending');
  const fee = await SEP.getFeeData();
  const maxFee = (fee.maxFeePerGas ?? 2_000_000_000n) * 2n;
  const prio = (fee.maxPriorityFeePerGas ?? 1_000_000_000n) * 2n;
  console.log(`starting nonce ${nonce}, maxFeePerGas ${maxFee}\n`);

  const sent: any[] = [];
  const push = (kind: string, data: string, gasLimit: bigint, label: string) => {
    const n = nonce++;
    sent.push({ kind, label, nonce: n, gasLimit: Number(gasLimit),
      p: op.sendTransaction({ to: WETH, data, gasLimit, nonce: n, maxFeePerGas: maxFee, maxPriorityFeePerGas: prio }) });
  };

  for (let i = 0; i < N_OOG; i++)
    push('OutOfGas', APPROVE + addr32(op.address) + w32(BigInt(i + 1)), 30_000n, `approve(${i + 1} wei) with 30,000 gas`);
  for (let i = 0; i < N_REV; i++)
    push('ExplicitRevert', TRANSFER + addr32(op.address) + w32(BigInt(i + 1)), 100_000n, `transfer(${i + 1} wei) on a zero balance`);

  console.log(`broadcasting ${sent.length} transactions...`);
  const items: any[] = [];
  for (const s of sent) {
    try {
      const tx = await s.p;
      const rc = await SEP.waitForTransaction(tx.hash);
      const full = await SEP.send('eth_getTransactionReceipt', [tx.hash]);
      const used = Number(rc!.gasUsed);
      const oog = used >= s.gasLimit;
      const verdict = full.status === '0x1' ? 'Succeeded' : (oog ? 'OutOfGas' : 'ExplicitRevert');
      const ok = verdict === s.kind;
      items.push({ kind: s.kind, verdict, ok, label: s.label, txHash: tx.hash, block: rc!.blockNumber,
        gasUsed: used, gasLimit: s.gasLimit, status: full.status, logs: full.logs.length,
        selector: s.kind === 'OutOfGas' ? APPROVE : TRANSFER,
        selectorName: s.kind === 'OutOfGas' ? 'approve(address,uint256)' : 'transfer(address,uint256)' });
      process.stdout.write(ok ? '.' : 'X');
    } catch (e: any) { process.stdout.write('!'); items.push({ kind: s.kind, error: String(e.message).slice(0, 80) }); }
  }
  console.log('\n');
  const good = items.filter(i => i.ok);
  const bad = items.filter(i => !i.ok);
  const byKind: Record<string, number> = {};
  for (const i of good) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  console.log(`produced ${good.length}/${items.length}: ${JSON.stringify(byKind)}`);
  if (bad.length) { console.log(`  ${bad.length} did not match their intended class:`); for (const x of bad.slice(0,5)) console.log('   ', JSON.stringify(x).slice(0,150)); }
  const maxBlock = Math.max(...good.map(i => i.block));
  console.log(`highest block ${maxBlock} — must be attested before the pool is usable`);
  console.log(`spent ~${formatEther(BigInt(good.reduce((a,i)=>a+i.gasUsed,0)) * maxFee)} ETH`);
  console.log(`remaining balance ${formatEther(await SEP.getBalance(op.address))} ETH`);
  writeFileSync('evidence/35-evidence-pool.json', JSON.stringify({
    operator: op.address, target: WETH, maxBlock, produced: good.length, items: good, rejected: bad,
  }, null, 2));
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
