/** Probe 39 — actually CALL both getLogsByEventSignature overloads on the
 *  deployed EvmV1Decoder, by explicit selector, over eth_call.
 *
 *  Four calls: the two selectors derived from the SDK's ABI JSON (tuple-expanded,
 *  the rule for a CONTRACT), and the two derived the way Solidity actually does it
 *  for a public LIBRARY function (struct referred to by canonical name).
 */
import { JsonRpcProvider, id, AbiCoder } from 'ethers';

const RPC = 'https://rpc.cc3-testnet.creditcoin.network';
const CC3 = new JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const A = AbiCoder.defaultAbiCoder();
const sel = (s: string) => id(s).slice(0, 10);

const TRANSFER = id('Transfer(address,address,uint256)');
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

/* Two logs: one Transfer from USDC, one Approval from WETH. A correct filter
   returns exactly the first. */
const LOGS = [
  [USDC, [TRANSFER, '0x' + '11'.repeat(32), '0x' + '22'.repeat(32)], '0x' + '00'.repeat(31) + '2a'],
  [WETH, [id('Approval(address,address,uint256)')], '0x'],
];
const LOG_T = '(address,bytes32[],bytes)[]';
const RECEIPT_T = `(uint8,uint64,${LOG_T},bytes)`;
const RECEIPT = [1, 21000, LOGS, '0x' + 'ab'.repeat(8)];

const CALLS = [
  { name: 'overload A · logs array   · SDK ABI selector    ', sig: `getLogsByEventSignature(${LOG_T},bytes32)`,     types: [LOG_T, 'bytes32'],     args: [LOGS, TRANSFER] },
  { name: 'overload A · logs array   · library selector    ', sig: 'getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)', types: [LOG_T, 'bytes32'], args: [LOGS, TRANSFER] },
  { name: 'overload B · receipt      · SDK ABI selector    ', sig: `getLogsByEventSignature(${RECEIPT_T},bytes32)`, types: [RECEIPT_T, 'bytes32'], args: [RECEIPT, TRANSFER] },
  { name: 'overload B · receipt      · library selector    ', sig: 'getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)', types: [RECEIPT_T, 'bytes32'], args: [RECEIPT, TRANSFER] },
];

async function main() {
  console.log(`decoder ${DEC}   rpc ${RPC}   chainId 102031\n`);
  for (const c of CALLS) {
    const s = sel(c.sig);
    const data = s + A.encode(c.types, c.args).slice(2);
    process.stdout.write(`${c.name} ${s}  `);
    try {
      const out = await CC3.call({ to: DEC, data });
      const [decoded] = A.decode([LOG_T], out);
      console.log(`OK — ${decoded.length} log(s), emitter ${decoded[0]?.[0]}`);
      console.log(`      calldata ${data.length - 2} hex chars, returndata ${out.length - 2}`);
    } catch (e: any) {
      console.log(`REVERT — ${e.shortMessage ?? e.message}`);
      console.log(`      revert data: ${e.data ?? '0x (empty)'}`);
    }
  }
}
main().catch((e) => console.error('FATAL', e));
