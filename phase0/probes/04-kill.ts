/** Phase 0 probe 04 — THE KILL QUESTION.
 *  Can a REVERTED Ethereum mainnet transaction be proven against the live CC3 precompile,
 *  and is receiptStatus readable as 0 on chain via EvmV1Decoder.decodeReceiptFields? */
import { Contract, JsonRpcProvider } from 'ethers';
import { proofProvider, blockProver, chainInfo } from '@gluwa/usc-sdk';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const PROVER = 'https://prover.cc3-testnet.creditcoin.network';
const EVM_V1_DECODER = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const CHAIN_KEY = 3;

const TX = process.argv[2] ?? '0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7';

const j = (o: any) => JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

async function main() {
  console.log('='.repeat(78));
  console.log('KILL QUESTION: prove a REVERTED mainnet transaction on CC3');
  console.log('='.repeat(78));

  // --- 0. ground truth from mainnet ---
  const rcpt = await ETH.send('eth_getTransactionReceipt', [TX]);
  const otx = await ETH.send('eth_getTransactionByHash', [TX]);
  console.log(`\n[ground truth · Ethereum mainnet]`);
  console.log(`  tx           ${TX}`);
  console.log(`  block        ${parseInt(rcpt.blockNumber, 16)}  index ${parseInt(rcpt.transactionIndex, 16)}`);
  console.log(`  status       ${rcpt.status}   <-- 0x0 == REVERTED`);
  console.log(`  to           ${rcpt.to}`);
  console.log(`  gasUsed      ${parseInt(rcpt.gasUsed, 16)}  of gasLimit ${parseInt(otx.gas, 16)}`);
  console.log(`  logs         ${rcpt.logs.length}`);
  if (rcpt.status !== '0x0') throw new Error('chosen tx is NOT reverted — pick another');

  // --- 1. attestation ---
  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  const tip = await info.getLatestAttestedHeightAndHash(CHAIN_KEY);
  const h = parseInt(rcpt.blockNumber, 16);
  console.log(`\n[attestation] tip=${tip.height}  target=${h}  attested=${h <= tip.height}`);

  // --- 2. generate proof for a reverted tx ---
  console.log(`\n[proof generation] POST ${PROVER}/api/v1/proof-by-tx/${CHAIN_KEY}/...`);
  const t0 = Date.now();
  const builder = new proofProvider.service.ProofBuilder(CHAIN_KEY, PROVER, 60000);
  const res = await builder.getProof(TX);
  console.log(`  success=${res.success}  in ${Date.now() - t0}ms`);
  if (!res.success) { console.log('  error:', j(res)); throw new Error('PROOF GENERATION REFUSED'); }
  const d: any = res.data!;
  console.log(`  headerNumber   ${d.headerNumber}`);
  console.log(`  txIndex        ${d.txIndex}`);
  console.log(`  txBytes        ${d.txBytes.length} hex chars (${(d.txBytes.length - 2) / 2} bytes)`);
  console.log(`  merkle root    ${d.merkleProof.root}`);
  console.log(`  merkle siblings ${d.merkleProof.siblings.length}`);
  console.log(`  continuity roots ${d.continuityProof.roots.length}  lowerEndpointDigest ${d.continuityProof.lowerEndpointDigest}`);

  // --- 3. verify against the LIVE precompile ---
  console.log(`\n[live precompile verify] ${blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS}`);
  const bp = new blockProver.PrecompileBlockProver(CC3);
  const ok = await bp.verifySingle(d.chainKey, d.headerNumber, d.txBytes, d.merkleProof, d.continuityProof);
  console.log(`  verifySingle -> ${ok}    <<<< KILL QUESTION ANSWER`);
  const idx = await bp.computeTransactionIndex(d.merkleProof);
  console.log(`  calculateTxIndex -> ${idx}  (mainnet says ${parseInt(rcpt.transactionIndex, 16)})`);

  // --- 4. decodeReceiptFields on chain ---
  console.log(`\n[EvmV1Decoder.decodeReceiptFields on CC3] ${EVM_V1_DECODER}`);
  const dec = new Contract(EVM_V1_DECODER, decoderAbi as any, CC3);
  const r = await dec.decodeReceiptFields(d.txBytes);
  console.log(`  receiptStatus    ${r.receiptStatus}     <<<< must read 0`);
  console.log(`  receiptGasUsed   ${r.receiptGasUsed}`);
  console.log(`  receiptLogs      ${r.receiptLogs.length}`);
  console.log(`  receiptLogsBloom ${r.receiptLogsBloom === '0x' ? '0x (empty)' : r.receiptLogsBloom.slice(0,20)+'... len='+((r.receiptLogsBloom.length-2)/2)}`);
  const bloomZero = /^0x0*$/.test(r.receiptLogsBloom);
  console.log(`  bloom all-zero   ${bloomZero}`);

  // --- 5. what else do the proven bytes carry? ---
  const txType = await dec.getTransactionType(d.txBytes);
  const c = await dec.decodeCommonTxFields(d.txBytes);
  console.log(`\n[proven bytes: common fields]  txType=${txType}`);
  console.log(`  from      ${c.from}`);
  console.log(`  to        ${c.to}  (toIsNull=${c.toIsNull})`);
  console.log(`  value     ${c.value}`);
  console.log(`  nonce     ${c.nonce}`);
  console.log(`  gasLimit  ${c.gasLimit}`);
  console.log(`  data      ${(c.data.length - 2) / 2} bytes, selector ${c.data.slice(0, 10)}`);
  console.log(`\n  gasUsed==gasLimit (out-of-gas signature)? ${r.receiptGasUsed === c.gasLimit}`);

  console.log(`\n[cross-check vs mainnet]`);
  console.log(`  from match     ${c.from.toLowerCase() === otx.from.toLowerCase()}`);
  console.log(`  to match       ${c.to.toLowerCase() === (rcpt.to ?? '').toLowerCase()}`);
  console.log(`  gasUsed match  ${r.receiptGasUsed === BigInt(parseInt(rcpt.gasUsed, 16))}`);
  console.log(`  index match    ${Number(idx) === parseInt(rcpt.transactionIndex, 16)}`);
  console.log(`  calldata match ${c.data.toLowerCase() === otx.input.toLowerCase()}`);
}
main().catch((e) => { console.error('\nFATAL', e.message ?? e); process.exit(1); });
