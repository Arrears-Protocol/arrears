/** Phase 0 probe 23 — deploy cost measurement + EXPLOIT DEMO HALF ONE.
 *  A naive ASC following the documented pattern accepts a REVERTED mainnet transaction. */
import { JsonRpcProvider, Wallet, ContractFactory, Contract, formatEther, Interface } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider } from '@gluwa/usc-sdk';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const EXPLORER = 'https://creditcoin-testnet.blockscout.com';
const DECODER = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const ART = '../contracts/out';
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
// the reverted 1inch v6 router transaction from the kill question
const REVERTED_TX = '0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7';

function load(name: string) {
  const a = JSON.parse(readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8'));
  let bc: string = a.bytecode.object;
  bc = bc.replace(/__\$[0-9a-f]{34}\$__/g, DECODER.slice(2).toLowerCase()); // link the deployed library
  if (/__\$/.test(bc)) throw new Error(`${name}: unlinked refs remain`);
  return { abi: a.abi, bytecode: bc };
}

async function deploy(name: string, args: any[] = []) {
  const { abi, bytecode } = load(name);
  const f = new ContractFactory(abi, bytecode, w);
  const c = await f.deploy(...args);
  const tx = c.deploymentTransaction()!;
  const rc = await tx.wait();
  const addr = await c.getAddress();
  const price = rc!.gasPrice ?? 0n;
  console.log(`  ${name.padEnd(20)} ${addr}`);
  console.log(`  ${''.padEnd(20)} initcode ${(bytecode.length-2)/2} B · gasUsed ${rc!.gasUsed.toLocaleString()} · cost ${formatEther(rc!.gasUsed * price)} tCTC · ${tx.hash}`);
  return { name, addr, gasUsed: Number(rc!.gasUsed), costWei: (rc!.gasUsed*price).toString(),
           cost: formatEther(rc!.gasUsed*price), hash: tx.hash, initcode: (bytecode.length-2)/2, abi };
}

async function main() {
  const out: any = { network: 'cc3-testnet', chainId: 102031, deployer: w.address, deploys: [], demoA: {} };
  console.log(`deployer ${w.address}  balance ${formatEther(await CC3.getBalance(w.address))} tCTC`);
  console.log(`gasPrice ${(await CC3.getFeeData()).gasPrice} wei\n`);

  console.log('=== DEPLOY COST MEASUREMENT ===');
  const trivial = await deploy('Trivial');
  const settle  = await deploy('NaiveSettlementASC');
  const evt     = await deploy('NaiveEventASC', ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']); // believes it watches USDC
  out.deploys = [trivial, settle, evt];

  console.log('\n=== EXPLOIT DEMO, HALF ONE ===');
  console.log('A naive ASC accepts a REVERTED Ethereum mainnet transaction as a genuine settlement.\n');
  const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  const pr = await b.getProof(REVERTED_TX);
  if (!pr.success) throw new Error('proof failed');
  const d: any = pr.data;
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  console.log(`  source tx      ${REVERTED_TX}`);
  console.log(`  mainnet block  ${d.headerNumber}  index ${d.txIndex}  receiptStatus 0 (REVERTED)`);

  const asc = new Contract(settle.addr, settle.abi, w);

  // 1. the naive path ACCEPTS it
  const t1 = await asc.recordSettlement(3, d.headerNumber, d.txBytes, mp, cp, { gasLimit: 3_000_000 });
  const r1 = await t1.wait();
  const iface = new Interface(settle.abi);
  let accepted: any = null;
  for (const l of r1.logs) { try { const p = iface.parseLog(l as any); if (p?.name === 'SettlementAccepted') accepted = p; } catch {} }
  console.log(`\n  NAIVE  recordSettlement       -> status ${r1.status}  gasUsed ${r1.gasUsed.toLocaleString()}`);
  console.log(`         tx ${r1.hash}`);
  if (accepted) {
    console.log(`         SettlementAccepted EMITTED:`);
    console.log(`           payer    ${accepted.args.payer}`);
    console.log(`           target   ${accepted.args.target}`);
    console.log(`           selector ${accepted.args.selector}`);
    console.log(`           gasUsed  ${accepted.args.gasUsed}`);
    console.log(`         The contract has recorded a FAILED transaction as a settlement.`);
  }
  out.demoA.naive = { hash: r1.hash, status: r1.status, gasUsed: Number(r1.gasUsed),
    accepted: accepted ? { payer: accepted.args.payer, target: accepted.args.target,
    selector: accepted.args.selector, gasUsed: accepted.args.gasUsed.toString() } : null };

  // 2. the strict path REJECTS it
  console.log(`\n  STRICT strictRecordSettlement -> `);
  try {
    const t2 = await asc.strictRecordSettlement(3, d.headerNumber, d.txBytes, mp, cp, { gasLimit: 3_000_000 });
    const r2 = await t2.wait();
    console.log(`         UNEXPECTEDLY SUCCEEDED status ${r2.status} tx ${r2.hash}`);
    out.demoA.strict = { hash: r2.hash, unexpected: true };
  } catch (e: any) {
    const data = e?.data ?? e?.info?.error?.data;
    let decoded = '';
    try { const err = iface.parseError(data); decoded = `${err?.name}(${err?.args.map(String).join(', ')})`; } catch { decoded = String(e.shortMessage ?? e.message).slice(0,120); }
    console.log(`         REVERTED with ${decoded}`);
    out.demoA.strict = { reverted: true, error: decoded };
  }

  out.explorer = { settlement: `${EXPLORER}/address/${settle.addr}`, event: `${EXPLORER}/address/${evt.addr}` };
  writeFileSync('evidence/23-deploy-demo-a.json', JSON.stringify(out, null, 2));
  console.log(`\nexplorer: ${EXPLORER}/address/${settle.addr}`);
  console.log(`balance left ${formatEther(await CC3.getBalance(w.address))} tCTC`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
