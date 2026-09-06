/** Probe 42 — supersedes probe 14. Same scan, but deriving selectors the way
 *  Solidity actually does for a public LIBRARY function: struct parameters are
 *  referred to by canonical name, not expanded to a tuple. */
import { JsonRpcProvider, Interface, id } from 'ethers';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network', undefined, { staticNetwork: true });
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';

/** The two struct-typed parameters in this library's public surface. */
const LIB_SIG: Record<string, string> = {
  'getLogsByEventSignature((address,bytes32[],bytes)[],bytes32)': 'getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)',
  'getLogsByEventSignature((uint8,uint64,(address,bytes32[],bytes)[],bytes),bytes32)': 'getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)',
};

const code = (await CC3.getCode(DEC)).toLowerCase();
console.log(`deployed EvmV1Decoder ${DEC}  (CC3 testnet, chainId 102031)`);
console.log(`runtime bytecode: ${(code.length - 2) / 2} bytes\n`);
const iface = new Interface(decoderAbi as any);
console.log('abi selector  library selector  present  signature');
let present = 0, absent = 0;
for (const f of iface.fragments) {
  if (f.type !== 'function') continue;
  const sig = (f as any).format('sighash');
  const abiSel = iface.getFunction(sig)!.selector;
  const libSig = LIB_SIG[sig];
  const realSel = libSig ? id(libSig).slice(0, 10) : abiSel;
  const ok = code.includes(realSel.slice(2));
  ok ? present++ : absent++;
  console.log(`${abiSel}    ${libSig ? realSel : '    —     '}      ${ok ? ' YES ' : ' no  '}   ${sig}`);
}
console.log(`\n${present} of ${present + absent} ABI functions are dispatchable in the deployed bytecode.`);
console.log(absent === 0 ? 'Nothing is missing. Probe 14 derived two selectors with the contract rule\n'
  + 'instead of the library rule and concluded they were absent.' : '');
