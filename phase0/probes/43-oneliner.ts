/** Probe 43 — produce the exact one-paste eth_call for the Creditcoin reply, and run it. */
import { id, AbiCoder } from 'ethers';
const A = AbiCoder.defaultAbiCoder();
const T = id('Transfer(address,address,uint256)');
const LOG_T = '(address,bytes32[],bytes)[]';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
// One log. The point is the selector, nothing else.
const logs = [[USDC, [T], '0x2a']];
const args = A.encode([LOG_T, 'bytes32'], [logs, T]).slice(2);
for (const [label, sel] of [['library selector', '0x07648c7a'], ['ABI selector    ', '0xe6c11b43']] as const) {
  console.log(`\n### ${label} ${sel}`);
  console.log(sel + args);
}
