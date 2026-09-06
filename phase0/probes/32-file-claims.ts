/** Phase 0 probe 32 — file the first real rulings.
 *  1. the SLASH        — out-of-gas, in scope -> ClaimRuled(OutOfGas) + BondSlashed + reprice
 *  2. the REFUSAL      — explicit revert, in scope -> ClaimRuled(ExplicitRevert) + SlashRefused
 *  3. STRICT refusal   — the same proof through submitSlashingClaim -> reverts, named error
 *  4. OUT OF SCOPE     — a selector no coverage names -> reverts, naming the axis
 *  Submitted by a relayer, credited to a separate beneficiary, to exercise sponsorship. */
import { JsonRpcProvider, Wallet, Contract, Interface, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider, chainInfo } from '@gluwa/usc-sdk';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const EX = 'https://creditcoin-testnet.blockscout.com';
const KEY = 1;
const D = JSON.parse(readFileSync('evidence/31-deploy-protocol.json', 'utf8'));
const S = JSON.parse(readFileSync('evidence/28-sepolia-oog-proven.json', 'utf8'));
const R = JSON.parse(readFileSync('evidence/30-sepolia-refusals.json', 'utf8'));
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const relayer = new Wallet(kf.accounts.deployer.privateKey, CC3);
const JUDGE = kf.accounts.impostor.address; // stands in for a judge with no CTC
const ART = '../contracts/out';
const abi = (n: string) => JSON.parse(readFileSync(`${ART}/${n}.sol/${n}.json`, 'utf8')).abi;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];
const MISS = ['None', 'ChainKey', 'Window', 'Target', 'Selector', 'Operator', 'Revoked', 'Expired', 'Exhausted'];

const court = new Contract(D.court, abi('ArrearsCourt'), relayer);
const reg = new Contract(D.registry, abi('ArrearsRegistry'), CC3);
const line = new Contract(D.creditLine, abi('ArrearsCreditLine'), CC3);
const iface = new Interface(abi('ArrearsCourt'));
const out: any = { court: D.court, operatorId: D.operatorId, relayer: relayer.address, beneficiary: JUDGE, rulings: {} };

async function proofFor(txHash: string, block: number) {
  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  for (let i = 0; i < 80; i++) {
    const tip = await info.getLatestAttestedHeightAndHash(KEY);
    if (tip.height >= block) break;
    if (i % 4 === 0) console.log(`     waiting for attestation: tip ${tip.height}, need ${block}`);
    await sleep(15000);
  }
  const b = new proofProvider.service.ProofBuilder(KEY, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  for (let i = 0; i < 20; i++) {
    const r = await b.getProof(txHash);
    if (r.success) return r.data as any;
    await sleep(15000);
  }
  throw new Error('proof unavailable');
}
const asProof = (d: any) => ({
  mp: [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])],
  cp: [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots],
});

async function main() {
  console.log(`court    ${D.court}`);
  console.log(`relayer  ${relayer.address}  (pays the gas)`);
  console.log(`judge    ${JUDGE}  (credited, holds no CTC)\n`);

  // ── 1. THE SLASH ───────────────────────────────────────────────────────────
  console.log('=== 1. THE SLASH: out-of-gas, in scope ===');
  console.log(`  source ${S.txHash} @ Sepolia ${S.block}`);
  const d1 = await proofFor(S.txHash, S.block);
  const p1 = asProof(d1);
  const pre = await court.previewClaim(D.operatorId, d1.headerNumber, d1.txBytes, p1.mp, p1.cp);
  console.log(`  previewClaim (free): valid=${pre[0]} verdict=${VERDICT[Number(pre[1])]} miss=${MISS[Number(pre[2])]} wouldSlash=${formatEther(pre[4])} tCTC`);
  const tBal = await CC3.getBalance(D.treasury);
  const t1 = await court.submitClaim(D.operatorId, d1.headerNumber, d1.txBytes, p1.mp, p1.cp, JUDGE, { gasLimit: 3_000_000 });
  const r1 = await t1.wait();
  console.log(`  submitClaim -> status ${r1.status}  gas ${r1.gasUsed}  ${r1.hash}`);
  let ruled: any, slashed: any, repriced: any;
  for (const l of r1.logs) {
    try { const p = iface.parseLog(l as any); if (p?.name === 'ClaimRuled') ruled = p; if (p?.name === 'BondSlashed') slashed = p; } catch {}
    try { const p = new Interface(abi('ArrearsCreditLine')).parseLog(l as any); if (p?.name === 'LineRepriced') repriced = p; } catch {}
  }
  console.log(`  ClaimRuled   verdict=${VERDICT[Number(ruled.args.verdict)]} slashed=${formatEther(ruled.args.slashed)} tCTC beneficiary=${ruled.args.beneficiary}`);
  if (slashed) console.log(`  BondSlashed  ${formatEther(slashed.args.amount)} tCTC, ${formatEther(slashed.args.remaining)} tCTC remaining`);
  if (repriced) console.log(`  LineRepriced limit ${formatEther(repriced.args.oldLimit)} -> ${formatEther(repriced.args.newLimit)}, premium ${repriced.args.oldPremiumBps} -> ${repriced.args.newPremiumBps} bps, strikes ${repriced.args.strikes}`);
  console.log(`  treasury ${formatEther(tBal)} -> ${formatEther(await CC3.getBalance(D.treasury))} tCTC`);
  out.rulings.slash = { hash: r1.hash, status: r1.status, gasUsed: Number(r1.gasUsed),
    sourceTx: S.txHash, sourceBlock: S.block, verdict: VERDICT[Number(ruled.args.verdict)],
    slashedWei: ruled.args.slashed.toString(), beneficiary: ruled.args.beneficiary,
    claimId: ruled.args.claimId, explorer: `${EX}/tx/${r1.hash}` };

  // ── 2. THE REFUSAL ─────────────────────────────────────────────────────────
  console.log('\n=== 2. THE REFUSAL: explicit revert, in scope, recorded but not slashed ===');
  const er = R.explicitRevert;
  console.log(`  source ${er.txHash} @ Sepolia ${er.block}  (gasUsed ${er.gasUsed} of ${er.gasLimit})`);
  const d2 = await proofFor(er.txHash, er.block);
  const p2 = asProof(d2);
  const tBal2 = await CC3.getBalance(D.treasury);
  const t2 = await court.submitClaim(D.operatorId, d2.headerNumber, d2.txBytes, p2.mp, p2.cp, JUDGE, { gasLimit: 3_000_000 });
  const r2 = await t2.wait();
  console.log(`  submitClaim -> status ${r2.status}  gas ${r2.gasUsed}  ${r2.hash}`);
  let ruled2: any, refused: any;
  for (const l of r2.logs) { try { const p = iface.parseLog(l as any); if (p?.name === 'ClaimRuled') ruled2 = p; if (p?.name === 'SlashRefused') refused = p; } catch {} }
  console.log(`  ClaimRuled    verdict=${VERDICT[Number(ruled2.args.verdict)]} slashed=${formatEther(ruled2.args.slashed)} tCTC`);
  console.log(`  SlashRefused  reason=${refused.args.reason}  gasUsed=${refused.args.gasUsed} gasLimit=${refused.args.gasLimit}`);
  const expected = iface.getError('NotSlashableExplicitRevert')!.selector;
  console.log(`  reason selector matches NotSlashableExplicitRevert: ${refused.args.reason === expected}  (${expected})`);
  console.log(`  treasury unchanged: ${formatEther(await CC3.getBalance(D.treasury)) === formatEther(tBal2)}`);
  out.rulings.refusal = { hash: r2.hash, status: r2.status, gasUsed: Number(r2.gasUsed),
    sourceTx: er.txHash, sourceBlock: er.block, verdict: VERDICT[Number(ruled2.args.verdict)],
    slashedWei: '0', refusalReasonSelector: refused.args.reason, namedError: 'NotSlashableExplicitRevert',
    claimId: ruled2.args.claimId, explorer: `${EX}/tx/${r2.hash}` };

  // ── 3. STRICT PATH ─────────────────────────────────────────────────────────
  console.log('\n=== 3. STRICT PATH on the same evidence: reverts with the named error ===');
  try {
    await CC3.call({ to: D.court, from: relayer.address,
      data: iface.encodeFunctionData('submitSlashingClaim', [D.operatorId, d2.headerNumber, d2.txBytes, p2.mp, p2.cp, JUDGE]) });
    console.log('  unexpectedly succeeded');
  } catch (e: any) {
    const raw = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    const err = iface.parseError(raw);
    console.log(`  REVERTED ${err!.name}(${err!.args.map((a: any) => a.toString()).join(', ')})`);
    out.rulings.strictRefusal = { error: `${err!.name}(${err!.args.map((a: any) => a.toString()).join(', ')})`, rawRevertData: raw };
  }

  // ── 4. OUT OF SCOPE ────────────────────────────────────────────────────────
  console.log('\n=== 4. OUT OF SCOPE: a selector no coverage names ===');
  const os_ = R.outOfScope;
  console.log(`  source ${os_.txHash} @ Sepolia ${os_.block}  selector ${os_.selector} (${os_.selectorName})`);
  const d3 = await proofFor(os_.txHash, os_.block);
  const p3 = asProof(d3);
  const pre3 = await court.previewClaim(D.operatorId, d3.headerNumber, d3.txBytes, p3.mp, p3.cp);
  console.log(`  previewClaim (free): valid=${pre3[0]} verdict=${VERDICT[Number(pre3[1])]} miss=${MISS[Number(pre3[2])]} coverage=${pre3[3]}`);
  let oosHash = '';
  try {
    const t3 = await court.submitClaim(D.operatorId, d3.headerNumber, d3.txBytes, p3.mp, p3.cp, JUDGE, { gasLimit: 3_000_000 });
    const r3 = await t3.wait();
    console.log(`  unexpectedly succeeded status ${r3.status}`);
  } catch (e: any) {
    oosHash = e?.receipt?.hash ?? e?.transaction?.hash ?? '';
    const raw = e?.data ?? e?.info?.error?.data;
    let decoded = 'revert data not returned by the node';
    try { const err = iface.parseError(raw); decoded = `${err!.name}(${MISS[Number(err!.args[0])]}, ${err!.args[1]}, ${err!.args[2]}, ${err!.args[3]})`; } catch {}
    console.log(`  REVERTED ${decoded}`);
    if (oosHash) console.log(`  mined as a failed transaction: ${EX}/tx/${oosHash}`);
    // also capture the decodable revert via eth_call
    try {
      await CC3.call({ to: D.court, from: relayer.address,
        data: iface.encodeFunctionData('submitClaim', [D.operatorId, d3.headerNumber, d3.txBytes, p3.mp, p3.cp, JUDGE]) });
    } catch (ce: any) {
      const craw = ce?.data ?? ce?.info?.error?.data;
      const cerr = iface.parseError(craw);
      console.log(`  decoded via eth_call: ${cerr!.name}(miss=${MISS[Number(cerr!.args[0])]}, target=${cerr!.args[1]}, selector=${cerr!.args[2]}, height=${cerr!.args[3]})`);
      out.rulings.outOfScope = { sourceTx: os_.txHash, sourceBlock: os_.block, minedTx: oosHash,
        error: `OutOfScope(${MISS[Number(cerr!.args[0])]}, ${cerr!.args[1]}, ${cerr!.args[2]}, ${cerr!.args[3]})`,
        missAxis: MISS[Number(cerr!.args[0])], rawRevertData: craw,
        explorer: oosHash ? `${EX}/tx/${oosHash}` : null };
    }
  }

  // ── final state ────────────────────────────────────────────────────────────
  const op = await reg.operator(D.operatorId);
  const terms = await line.terms(D.operatorId);
  console.log(`\n=== final operator state ===`);
  console.log(`  bonded ${formatEther(op.bonded)}  committed ${formatEther(op.committed)}  slashed ${formatEther(op.slashed)}`);
  console.log(`  credit limit ${formatEther(terms.limit)} tCTC  premium ${terms.premiumBps} bps  strikes ${terms.strikes}`);
  console.log(`  claims on record: ${(await court.claimsAgainst(D.operatorId)).length}`);
  out.finalState = { bondedWei: op.bonded.toString(), slashedWei: op.slashed.toString(),
    creditLimitWei: terms.limit.toString(), premiumBps: Number(terms.premiumBps), strikes: Number(terms.strikes) };
  writeFileSync('evidence/32-rulings.json', JSON.stringify(out, null, 2));
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
