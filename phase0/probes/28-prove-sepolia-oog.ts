/** Phase 0 probe 28 — prove the Sepolia out-of-gas failure through the live precompile,
 *  and confirm the court would classify it as slashable. */
import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { proofProvider, blockProver, chainInfo } from '@gluwa/usc-sdk';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const KEY = 1;
const a = JSON.parse(readFileSync('evidence/27-sepolia-oog.json', 'utf8'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  for (let i = 0; i < 90; i++) {
    const tip = await info.getLatestAttestedHeightAndHash(KEY);
    if (tip.height >= a.block) { console.log(`attested (tip ${tip.height} >= ${a.block})`); break; }
    if (i % 5 === 0) console.log(`  waiting: tip ${tip.height}, need ${a.block} (${a.block - tip.height} behind)`);
    await sleep(15000);
  }
  const b = new proofProvider.service.ProofBuilder(KEY, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  let d: any = null;
  for (let i = 0; i < 20; i++) {
    const r = await b.getProof(a.txHash);
    if (r.success) { d = r.data; break; }
    await sleep(15000);
  }
  if (!d) throw new Error('proof unavailable');
  const bp = new blockProver.PrecompileBlockProver(CC3);
  const ok = await bp.verifySingle(KEY, d.headerNumber, d.txBytes, d.merkleProof, d.continuityProof);
  const dec = new Contract(DEC, decoderAbi as any, CC3);
  const rf = await dec.decodeReceiptFields(d.txBytes);
  const cf = await dec.decodeCommonTxFields(d.txBytes);
  console.log(`\nverifySingle          ${ok}`);
  console.log(`receiptStatus         ${rf.receiptStatus}`);
  console.log(`receiptGasUsed        ${rf.receiptGasUsed}`);
  console.log(`commonTx.gasLimit     ${cf.gasLimit}`);
  console.log(`logs                  ${rf.receiptLogs.length}`);
  console.log(`from                  ${cf.from}`);
  console.log(`to                    ${cf.to}`);
  console.log(`selector              ${cf.data.slice(0, 10)}`);
  const slashable = rf.receiptStatus === 0n || rf.receiptStatus === 0
    ? rf.receiptGasUsed >= cf.gasLimit : false;
  console.log(`\nArrears verdict:      ${slashable ? 'OutOfGas -> SLASHABLE' : 'not slashable'}`);
  writeFileSync('evidence/28-sepolia-oog-proven.json', JSON.stringify({
    ...a, proven: ok, headerNumber: d.headerNumber, txIndex: d.txIndex,
    contRoots: d.continuityProof.roots.length,
    decoded: { receiptStatus: Number(rf.receiptStatus), gasUsed: rf.receiptGasUsed.toString(),
      gasLimit: cf.gasLimit.toString(), logs: rf.receiptLogs.length, from: cf.from, to: cf.to,
      selector: cf.data.slice(0, 10) },
    verdict: slashable ? 'OutOfGas' : 'other',
  }, null, 2));
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
