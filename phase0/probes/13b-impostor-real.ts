/** Phase 0 probe 13b — the impostor flaw, demonstrated on REAL proven mainnet bytes.
 *  A real swap emits Transfer from several DIFFERENT token contracts. The SDK-blessed
 *  helper returns all of them, because it matches topics[0] and never reads the emitter. */
import { JsonRpcProvider, Contract, id } from 'ethers';
import { proofProvider } from '@gluwa/usc-sdk';
import decoderAbi from '@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json' with { type: 'json' };
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const ETH = new JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const DEC = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const TRANSFER = id('Transfer(address,address,uint256)');
const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 90000);

async function main() {
  const dec = new Contract(DEC, decoderAbi as any, CC3);
  console.log(`deployed EvmV1Decoder code size: ${((await CC3.getCode(DEC)).length - 2) / 2} bytes\n`);

  // find a SUCCESSFUL tx whose receipt has Transfer logs from >= 2 distinct emitters
  let target: any = null;
  for (let blk = 25916354; blk > 25916344 && !target; blk--) {
    const rec = await ETH.send('eth_getBlockReceipts', ['0x' + blk.toString(16)]);
    for (const r of rec ?? []) {
      if (r.status !== '0x1') continue;
      const t = r.logs.filter((l: any) => l.topics[0] === TRANSFER);
      const emitters = new Set(t.map((l: any) => l.address.toLowerCase()));
      if (emitters.size >= 2 && r.logs.length <= 30) {
        target = { hash: r.transactionHash, block: blk, transfers: t.length, emitters: [...emitters] }; break;
      }
    }
  }
  if (!target) { console.log('no suitable tx found'); return; }
  console.log(`real mainnet tx ${target.hash} @ block ${target.block}`);
  console.log(`  ${target.transfers} Transfer logs from ${target.emitters.length} DISTINCT token contracts:`);
  for (const e of target.emitters) console.log(`    ${e}`);

  const r = await b.getProof(target.hash);
  if (!r.success) { console.log('proof failed'); return; }
  const d: any = r.data;
  const receipt = await dec.decodeReceiptFields(d.txBytes);
  console.log(`\nproven+decoded on CC3: status=${receipt.receiptStatus} logs=${receipt.receiptLogs.length}`);

  const plainLogs = receipt.receiptLogs.map((l: any) => [String(l[0]), Array.from(l[1]).map(String), String(l[2])]);
  const matched = await dec['getLogsByEventSignature((uint8,uint64,(address,bytes32[],bytes)[],bytes),bytes32)'](
    [Number(receipt.receiptStatus), receipt.receiptGasUsed, plainLogs, receipt.receiptLogsBloom], TRANSFER);

  const got = new Set<string>();
  console.log(`\ngetLogsByEventSignature(receipt, Transfer) -> ${matched.length} logs, emitted by:`);
  for (const l of matched) got.add(String(l[0]).toLowerCase());
  for (const e of got) console.log(`    ${e}`);
  console.log(`\n=> ${got.size} DIFFERENT contracts pass the same filter. The helper never reads`);
  console.log(`   logs[i].address_ (EvmV1Decoder.sol:133). An ASC that says "I found a Transfer"`);
  console.log(`   has said nothing about WHO emitted it.`);
}
main().catch(e => console.error('FATAL', String(e.message ?? e).slice(0, 300)));
