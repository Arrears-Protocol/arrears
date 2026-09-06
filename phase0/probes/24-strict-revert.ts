/** Phase 0 probe 24 — capture the strict variant's custom error with its decoded arguments. */
import { JsonRpcProvider, Wallet, Interface } from 'ethers';
import { readFileSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const kf = JSON.parse(readFileSync(join(homedir(),'.config','creditcoin','arrears-testnet.json'),'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const dep = JSON.parse(readFileSync('evidence/23-deploy-demo-a.json','utf8'));
const settle = dep.deploys.find((d: any) => d.name === 'NaiveSettlementASC');
const REVERTED_TX = '0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7';

async function main() {
  const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  const d: any = (await b.getProof(REVERTED_TX)).data;
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  const iface = new Interface(settle.abi);
  const data = iface.encodeFunctionData('strictRecordSettlement', [3, d.headerNumber, d.txBytes, mp, cp]);
  console.log(`strictRecordSettlement on ${settle.addr}`);
  console.log(`  against the same reverted mainnet tx the naive path accepted\n`);
  try {
    const r = await CC3.call({ to: settle.addr, data, from: w.address });
    console.log('  unexpectedly returned', r);
  } catch (e: any) {
    const raw = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    console.log(`  raw revert data: ${raw}`);
    if (raw && raw !== '0x') {
      try {
        const err = iface.parseError(raw);
        console.log(`\n  DECODED: ${err!.name}(${err!.args.map((a:any)=>a.toString()).join(', ')})`);
        const names = err!.fragment.inputs.map(i => i.name);
        err!.args.forEach((a:any,i:number)=>console.log(`    ${names[i].padEnd(14)} ${a.toString()}`));
      } catch (pe) { console.log('  could not parse:', String(pe).slice(0,100)); }
    } else {
      console.log('  (empty revert data — pallet-evm dropped the reason, the documented behaviour)');
    }
  }
  // and prove the naive path really did store it
  const key = await CC3.call({ to: settle.addr, from: w.address,
    data: iface.encodeFunctionData('settled', [
      require('ethers').keccak256(require('ethers').AbiCoder.defaultAbiCoder().encode(
        ['uint64','uint64','address','uint64'],
        [3, d.headerNumber, '0x8B65363a01510490fbA03cEA97B14C73b7eE8f75', 8697]))]) });
  console.log(`\n  settled[key] on chain = ${BigInt(key) === 1n}  <- the failed transaction is recorded as settled`);
}
main().catch(e => console.error('FATAL', e.message ?? e));
