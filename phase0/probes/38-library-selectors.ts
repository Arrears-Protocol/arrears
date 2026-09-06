/** Probe 38 — re-test getLogsByEventSignature against the deployed EvmV1Decoder.
 *
 *  EvmV1Decoder is a `library`, not a contract. Solidity computes the external
 *  signature of a PUBLIC LIBRARY function differently from a contract's: struct
 *  parameters are referred to by their canonical name, not expanded to a tuple.
 *  So the selector for a library function taking a struct is NOT the one derived
 *  from the ABI JSON that ships in the SDK.
 */
import { JsonRpcProvider, id, AbiCoder } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';

const sel = (sig: string) => id(sig).slice(0, 10);

const CANDIDATES = [
  // what the SDK ABI JSON yields (tuple-expanded, the contract rule)
  'getLogsByEventSignature((address,bytes32[],bytes)[],bytes32)',
  'getLogsByEventSignature((uint8,uint64,(address,bytes32[],bytes)[],bytes),bytes32)',
  // what Solidity actually uses for a PUBLIC LIBRARY function (struct by name)
  'getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)',
  'getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)',
  // defensive: unqualified struct name, in case the library name is omitted
  'getLogsByEventSignature(LogEntry[],bytes32)',
  'getLogsByEventSignature(ReceiptFields,bytes32)',
];

async function main() {
  const code = (await CC3.getCode(DEC)).toLowerCase();
  console.log(`EvmV1Decoder ${DEC} on CC3 (chainId 102031)`);
  console.log(`runtime bytecode: ${(code.length - 2) / 2} bytes\n`);

  console.log('selector    in bytecode  signature');
  for (const sig of CANDIDATES) {
    const s = sel(sig);
    console.log(`${s}  ${code.includes(s.slice(2)) ? '    YES    ' : '    no     '}  ${sig}`);
  }
}
main().catch((e) => console.error('FATAL', e.message));
