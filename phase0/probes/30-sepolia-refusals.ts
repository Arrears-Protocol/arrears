/** Phase 0 probe 30 — produce two more GENUINE Sepolia failures, to exercise the refusals.
 *
 *  1. An EXPLICIT revert, in scope: WETH.transfer() with a zero balance. WETH9 guards with
 *     `require(balanceOf[msg.sender] >= wad)`, so it reverts and REFUNDS the remaining gas --
 *     gasUsed << gasLimit. Recorded, never slashable.
 *  2. An out-of-scope failure: WETH.withdraw(), same zero balance, a selector no coverage names.
 *
 *  Neither is contrived. Both are real calls to the real WETH9 that fail for the ordinary
 *  reason: the caller does not have the balance. */
import { JsonRpcProvider, Wallet, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';

const SEP = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const TRANSFER = '0xa9059cbb'; // transfer(address,uint256)
const WITHDRAW = '0x2e1a7d4d'; // withdraw(uint256)
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const op = new Wallet(kf.accounts.operator.privateKey, SEP);

const pad = (h: string) => h.slice(2).padStart(64, '0');

async function send(label: string, data: string, gasLimit: bigint) {
  console.log(`\n=== ${label} ===`);
  const tx = await op.sendTransaction({ to: WETH, data, gasLimit });
  console.log(`  sent ${tx.hash}`);
  const rc = await SEP.waitForTransaction(tx.hash);
  const full = await SEP.send('eth_getTransactionReceipt', [tx.hash]);
  const used = Number(rc!.gasUsed);
  console.log(`  block ${rc!.blockNumber}  status ${full.status}  gasUsed ${used} / gasLimit ${gasLimit}  logs ${full.logs.length}`);
  const oog = BigInt(used) >= gasLimit;
  console.log(`  gasUsed >= gasLimit ? ${oog}  ->  ${oog ? 'OutOfGas' : 'ExplicitRevert'}`);
  if (full.status !== '0x0') throw new Error(`${label}: expected a failure, got success`);
  if (oog) throw new Error(`${label}: expected an EXPLICIT revert, but it ran out of gas`);
  return { label, txHash: tx.hash, block: rc!.blockNumber, gasUsed: used, gasLimit: Number(gasLimit),
           status: full.status, logs: full.logs.length,
           explorer: `https://sepolia.etherscan.io/tx/${tx.hash}` };
}

async function main() {
  console.log(`operator ${op.address}  ${formatEther(await SEP.getBalance(op.address))} ETH`);
  console.log(`WETH balance is zero -- the deposit that would have created one ran out of gas.`);

  // transfer 1 wei of WETH to ourselves; the require() fails on a zero balance
  const transferData = TRANSFER + pad(op.address) + (1n).toString(16).padStart(64, '0');
  const a = await send('EXPLICIT REVERT, in scope: WETH.transfer() on a zero balance', transferData, 100_000n);

  // withdraw 1 wei; same guard, but a selector no coverage will name
  const withdrawData = WITHDRAW + (1n).toString(16).padStart(64, '0');
  const b = await send('OUT OF SCOPE: WETH.withdraw(), a selector no coverage names', withdrawData, 100_000n);

  writeFileSync('evidence/30-sepolia-refusals.json', JSON.stringify({
    operator: op.address, target: WETH,
    explicitRevert: { ...a, selector: TRANSFER, selectorName: 'transfer(address,uint256)' },
    outOfScope: { ...b, selector: WITHDRAW, selectorName: 'withdraw(uint256)' },
  }, null, 2));
  console.log(`\nboth mined. these are ordinary failures: the caller does not have the balance.`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
