/** Phase 0 probe 14 — which EvmV1Decoder selectors are ACTUALLY in the deployed CC3 bytecode? */
import { JsonRpcProvider, Interface } from 'ethers';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';

async function main() {
  const code = (await CC3.getCode(DEC)).toLowerCase();
  console.log(`deployed EvmV1Decoder ${DEC}`);
  console.log(`runtime bytecode: ${(code.length - 2) / 2} bytes\n`);
  const iface = new Interface(decoderAbi as any);
  console.log('selector    present  signature');
  let present = 0, absent = 0;
  for (const f of iface.fragments) {
    if (f.type !== 'function') continue;
    const frag: any = f;
    const sel = iface.getFunction(frag.format('sighash'))!.selector;
    const inCode = code.includes(sel.slice(2));
    inCode ? present++ : absent++;
    console.log(`${sel}  ${inCode ? '  YES  ' : '  no   '}  ${frag.format('sighash')}`);
  }
  console.log(`\n${present} of ${present + absent} ABI functions are dispatchable in the deployed bytecode.`);
}
main().catch(e => console.error('FATAL', e.message));
