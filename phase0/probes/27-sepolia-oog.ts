/** Phase 0 probe 27 — produce a GENUINE out-of-gas failure on Sepolia.
 *  Real contract, real work, an under-provisioned gas limit. Not a gas-burner built to fail:
 *  this is a plain WETH deposit() with a limit set below what the SSTORE actually needs, which
 *  is exactly how it happens in production when someone hardcodes a stale limit.
 *  Same artifact class as mainnet 0xc22eb305... , on a chain where we hold the key. */
import { JsonRpcProvider, Wallet, formatEther, parseEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';

const SEP = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // canonical Sepolia WETH9
const DEPOSIT = '0xd0e30db0';                              // deposit()
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const funder = new Wallet(kf.accounts.impostor.privateKey, SEP);
const op = new Wallet(kf.accounts.operator.privateKey, SEP);

async function main() {
  console.log(`operator (the bonded party) ${op.address}`);
  let bal = await SEP.getBalance(op.address);
  console.log(`  balance ${formatEther(bal)} ETH`);
  if (bal < parseEther('0.01')) {
    console.log(`  funding from ${funder.address}...`);
    const f = await funder.sendTransaction({ to: op.address, value: parseEther('0.03') });
    await f.wait();
    bal = await SEP.getBalance(op.address);
    console.log(`  funded -> ${formatEther(bal)} ETH  (${f.hash})`);
  }

  // What the call actually needs, measured rather than guessed.
  const needed = await SEP.estimateGas({ from: op.address, to: WETH, data: DEPOSIT, value: parseEther('0.001') });
  console.log(`\nWETH.deposit() honestly needs ${needed} gas (estimateGas against the real contract)`);

  const GAS_LIMIT = 30_000n;
  console.log(`we will send it ${GAS_LIMIT} — above the 21,064 intrinsic, below the ${needed} it needs`);
  console.log(`so it enters the contract, starts real work, and dies mid-SSTORE\n`);
  if (GAS_LIMIT >= needed) throw new Error('limit is not under-provisioned; pick a lower one');

  const tx = await op.sendTransaction({ to: WETH, data: DEPOSIT, value: parseEther('0.001'), gasLimit: GAS_LIMIT });
  console.log(`sent ${tx.hash}`);
  const rc = await SEP.waitForTransaction(tx.hash);
  const full = await SEP.send('eth_getTransactionReceipt', [tx.hash]);

  console.log(`\nmined in block ${rc!.blockNumber}`);
  console.log(`  status        ${full.status}   ${full.status === '0x0' ? '<- FAILED' : '<- succeeded, not what we want'}`);
  console.log(`  gasUsed       ${rc!.gasUsed}`);
  console.log(`  gasLimit      ${GAS_LIMIT}`);
  console.log(`  logs          ${full.logs.length}`);
  const oog = rc!.gasUsed >= GAS_LIMIT;
  console.log(`\n  gasUsed >= gasLimit ?  ${oog}   ${oog ? '<- OUT OF GAS: the slashable class' : '<- not out of gas'}`);
  if (!oog || full.status !== '0x0') throw new Error('did not produce a genuine out-of-gas failure');

  const out = {
    chain: 'ethereum-sepolia', chainKey: 1,
    operator: op.address, target: WETH, selector: DEPOSIT,
    txHash: tx.hash, block: rc!.blockNumber,
    gasUsed: Number(rc!.gasUsed), gasLimit: Number(GAS_LIMIT),
    honestlyNeeded: Number(needed), receiptStatus: full.status, logs: full.logs.length,
    explorer: `https://sepolia.etherscan.io/tx/${tx.hash}`,
  };
  writeFileSync('evidence/27-sepolia-oog.json', JSON.stringify(out, null, 2));
  console.log(`\n  ${out.explorer}`);
  console.log(`\nThis is a real WETH deposit that ran out of gas. Nobody raced the operator into`);
  console.log(`choosing 30,000; they chose it, and it was wrong. That is why it is slashable.`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
