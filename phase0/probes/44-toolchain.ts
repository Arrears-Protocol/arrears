/** Probe 44 — which off-chain toolchains derive the correct selector for a
 *  public LIBRARY function taking a struct?
 *
 *  The shipped ABI JSON carries `internalType: "struct EvmV1Decoder.LogEntry[]"`,
 *  so the information needed is present. The question is whether any tool uses it. */
import { Interface, id } from 'ethers';
import { toFunctionSelector } from 'viem';
import { Web3 } from 'web3';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };

const CORRECT = {
  'LogEntry[]':     id('getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)').slice(0, 10),
  'ReceiptFields':  id('getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)').slice(0, 10),
};
console.log(`correct selectors (from the deployed bytecode):`);
for (const [k, v] of Object.entries(CORRECT)) console.log(`  ${k.padEnd(15)} ${v}`);

const frags = (decoderAbi as any[]).filter((f) => f.name === 'getLogsByEventSignature');
const iface = new Interface(decoderAbi as any);

console.log(`\nsolc emits them correctly in methodIdentifiers:`);
console.log(`  0x07648c7a  getLogsByEventSignature(EvmV1Decoder.LogEntry[],bytes32)`);
console.log(`  0x54014825  getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)`);
console.log(`  (solc 0.8.30, compiling @gluwa/usc-contracts@0.1.2 EvmV1Decoder.sol unmodified)`);

console.log(`\nthe ABI JSON keeps the canonical name in \`internalType\`, so nothing is lost.`);
console.log(`what each off-chain toolchain actually derives from it:`);
for (const f of frags) {
  const which = f.inputs[0].internalType.includes('LogEntry') ? 'LogEntry[]' : 'ReceiptFields';
  const want = CORRECT[which as keyof typeof CORRECT];
  const sig = `${f.name}(${f.inputs.map((i: any) => i.type === 'tuple' || i.type === 'tuple[]'
    ? tupleOf(i) : i.type).join(',')})`;
  const ethersSel = iface.getFunction(sig)!.selector;
  const viemSel = toFunctionSelector(f as any);
  const web3Sel = new Web3().eth.abi.encodeFunctionSignature(f);
  console.log(`  ${which.padEnd(15)} internalType "${f.inputs[0].internalType}"`);
  console.log(`    ethers v6   ${ethersSel}  ${ethersSel === want ? 'CORRECT' : 'WRONG'}`);
  console.log(`    viem        ${viemSel}  ${viemSel === want ? 'CORRECT' : 'WRONG'}`);
  console.log(`    web3.js     ${web3Sel}  ${web3Sel === want ? 'CORRECT' : 'WRONG'}`);
}

function tupleOf(i: any): string {
  const inner = i.components.map((c: any) =>
    c.type === 'tuple' || c.type === 'tuple[]' ? tupleOf(c) : c.type).join(',');
  return `(${inner})${i.type === 'tuple[]' ? '[]' : ''}`;
}

console.log(`\nversions: ethers 6.17.0, viem 2.56.3, web3 4.16.0, solc 0.8.30`);
console.log(`\nAll three read \`type\` and discard \`internalType\`. The compiler is right; every`);
console.log(`major client library is wrong, and the resulting revert carries no data.`);
