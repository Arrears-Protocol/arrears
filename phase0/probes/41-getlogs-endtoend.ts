/** Probe 41 — the complete artifact for Creditcoin: a real Ethereum mainnet tx,
 *  proven on CC3, receipt decoded, then log-filtered with getLogsByEventSignature
 *  called by EXPLICIT SELECTOR on the deployed decoder. */
import { JsonRpcProvider, Contract, id, AbiCoder } from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };

const CC3_RPC = 'https://rpc.cc3-testnet.creditcoin.network';
const CC3 = new JsonRpcProvider(CC3_RPC, undefined, { staticNetwork: true });
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const CHAIN_KEY = 3;                       // Ethereum mainnet
const TX = '0x77e7a60b4c1b02970ed9f09cceb7211b52a2a2d33061aa3319be90997af45a7f';
const BLOCK = 25916354;
const TRANSFER = id('Transfer(address,address,uint256)');
const A = AbiCoder.defaultAbiCoder();

const LOG_T = '(address,bytes32[],bytes)[]';
const RECEIPT_T = `(uint8,uint64,${LOG_T},bytes)`;
const SEL_SDK     = id(`getLogsByEventSignature(${RECEIPT_T},bytes32)`).slice(0, 10);
const SEL_LIBRARY = id('getLogsByEventSignature(EvmV1Decoder.ReceiptFields,bytes32)').slice(0, 10);

const b = new proofProvider.service.ProofBuilder(CHAIN_KEY, 'https://prover.cc3-testnet.creditcoin.network', 90000);

async function main() {
  console.log(`target chain: Ethereum mainnet, Attestcoin chain key ${CHAIN_KEY}`);
  console.log(`tx:           ${TX}  (block ${BLOCK.toLocaleString('en-US')})`);
  console.log(`decoder:      ${DEC} on CC3 testnet (chainId 102031)\n`);

  const r = await b.getProof(TX);
  if (!r.success) { console.log('proof failed'); return; }
  const txBytes = (r.data as any).txBytes;
  console.log(`proof built. txBytes ${(txBytes.length - 2) / 2} bytes`);

  const dec = new Contract(DEC, decoderAbi as any, CC3);
  const receipt = await dec.decodeReceiptFields(txBytes);
  console.log(`decodeReceiptFields → status ${receipt.receiptStatus}, gasUsed ${receipt.receiptGasUsed}, ${receipt.receiptLogs.length} logs\n`);

  const args = A.encode([RECEIPT_T, 'bytes32'], [[
    Number(receipt.receiptStatus), receipt.receiptGasUsed,
    receipt.receiptLogs.map((l: any) => [String(l[0]), Array.from(l[1]).map(String), String(l[2])]),
    receipt.receiptLogsBloom,
  ], TRANSFER]);

  for (const [label, s] of [['SDK-ABI selector    ', SEL_SDK], ['library selector    ', SEL_LIBRARY]] as const) {
    process.stdout.write(`getLogsByEventSignature · ${label} ${s}  `);
    try {
      const out = await CC3.call({ to: DEC, data: s + args.slice(2) });
      const [logs] = A.decode([LOG_T], out);
      const emitters = [...new Set(logs.map((l: any) => l[0].toLowerCase()))];
      console.log(`OK — ${logs.length} Transfer logs from ${emitters.length} distinct emitters`);
      emitters.forEach((e) => console.log(`      ${e}`));
    } catch (e: any) {
      console.log(`REVERT — ${e.shortMessage ?? e.message}; revert data ${e.data ?? '0x (empty)'}`);
    }
  }
}
main().catch((e) => console.error('FATAL', e.shortMessage ?? e.message));
