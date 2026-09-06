/** Probe 40 — does the DEPLOYED getLogsByEventSignature check the emitter?
 *  Two Transfer logs from two different contracts, same topic0. */
import { JsonRpcProvider, id, AbiCoder } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network', undefined, { staticNetwork: true });
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const A = AbiCoder.defaultAbiCoder();
const T = id('Transfer(address,address,uint256)');
const LOG_T = '(address,bytes32[],bytes)[]';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const IMPOSTOR = '0x00000000000000000000000000000000DeaDBeef';
const logs = [[USDC, [T], '0x2a'], [IMPOSTOR, [T], '0x2a']];
const data = id('getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)').slice(0, 10)
  + A.encode([LOG_T, 'bytes32'], [logs, T]).slice(2);
const out = await CC3.call({ to: DEC, data });
const [r] = A.decode([LOG_T], out);
console.log(`emitters passed in: ${USDC}, ${IMPOSTOR}`);
console.log(`logs returned: ${r.length}`);
for (const l of r) console.log(`  ${l[0]}`);
console.log(r.length === 2 ? '\n=> the deployed copy filters on topic0 ONLY; the emitter is never read.'
                           : '\n=> the deployed copy DOES filter by emitter.');
