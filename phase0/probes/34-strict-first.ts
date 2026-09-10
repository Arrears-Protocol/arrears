/** Phase 0 probe 34 — redo the strict-path demonstration in the CORRECT order.
 *
 *  Probe 32 ran submitClaim first, which recorded the claim and consumed the globally unique
 *  claim id, so the strict path afterwards reverted AlreadyClaimed instead of the named error.
 *  That was a flaw in the script's ordering, not in the contract: recording is what burns the id,
 *  so a caller who wants the strict refusal must ask for it BEFORE recording.
 *
 *  Here: a fresh explicit revert on Sepolia, submitSlashingClaim FIRST as a real transaction. */
import { JsonRpcProvider, Wallet, Contract, Interface, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider, chainInfo } from '@gluwa/usc-sdk';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const SEP = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const EX = 'https://creditcoin-testnet.blockscout.com';
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const TRANSFER = '0xa9059cbb';
const KEY = 1;
const D = JSON.parse(readFileSync('evidence/31-deploy-protocol.json', 'utf8'));
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const relayer = new Wallet(kf.accounts.deployer.privateKey, CC3);
const op = new Wallet(kf.accounts.operator.privateKey, SEP);
const JUDGE = kf.accounts.impostor.address;
const ART = '../contracts/out';
const abi = (n: string) => JSON.parse(readFileSync(`${ART}/${n}.sol/${n}.json`, 'utf8')).abi;
const iface = new Interface(abi('ArrearsCourt'));
const court = new Contract(D.court, abi('ArrearsCourt'), relayer);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pad = (h: string) => h.slice(2).padStart(64, '0');

async function main() {
  console.log('=== a fresh explicit revert on Sepolia ===');
  const data = TRANSFER + pad(op.address) + (2n).toString(16).padStart(64, '0');
  const stx = await op.sendTransaction({ to: WETH, data, gasLimit: 100_000n });
  const src = await SEP.waitForTransaction(stx.hash);
  const full = await SEP.send('eth_getTransactionReceipt', [stx.hash]);
  console.log(`  ${stx.hash}  block ${src!.blockNumber}  status ${full.status}  gasUsed ${src!.gasUsed}/100000`);
  if (full.status !== '0x0' || src!.gasUsed >= 100_000n) throw new Error('wanted an explicit revert');

  const info = new chainInfo.PrecompileChainInfoProvider(CC3);
  for (let i = 0; i < 90; i++) {
    const tip = await info.getLatestAttestedHeightAndHash(KEY);
    if (tip.height >= src!.blockNumber) { console.log(`  attested (tip ${tip.height})`); break; }
    if (i % 5 === 0) console.log(`  waiting: tip ${tip.height}, need ${src!.blockNumber}`);
    await sleep(15000);
  }
  const b = new proofProvider.service.ProofBuilder(KEY, 'https://prover.cc3-testnet.creditcoin.network', 120000);
  let d: any = null;
  for (let i = 0; i < 20; i++) { const r = await b.getProof(stx.hash); if (r.success) { d = r.data; break; } await sleep(15000); }
  if (!d) throw new Error('proof unavailable');
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];

  console.log('\n=== STRICT PATH FIRST, as a real transaction ===');
  console.log('  nothing has been recorded against this evidence yet, so the claim id is free');
  let minedHash = '', decoded = '';
  try {
    const t = await court.submitSlashingClaim(D.operatorId, d.headerNumber, d.txBytes, mp, cp, JUDGE, { gasLimit: 3_000_000 });
    const r = await t.wait();
    console.log(`  UNEXPECTEDLY SUCCEEDED status ${r.status}`);
  } catch (e: any) {
    minedHash = e?.receipt?.hash ?? e?.transaction?.hash ?? '';
    console.log(`  mined and REVERTED: ${minedHash}`);
    console.log(`  ${EX}/tx/${minedHash}`);
    // a mined revert's receipt carries no return data (true on any EVM chain); eth_call returns it
    try {
      await CC3.call({ to: D.court, from: relayer.address,
        data: iface.encodeFunctionData('submitSlashingClaim', [D.operatorId, d.headerNumber, d.txBytes, mp, cp, JUDGE]) });
    } catch (ce: any) {
      const raw = ce?.data ?? ce?.info?.error?.data;
      const err = iface.parseError(raw);
      decoded = `${err!.name}(${err!.args.map((a: any) => a.toString()).join(', ')})`;
      console.log(`  decoded via eth_call: ${decoded}`);
      console.log(`  selector ${raw.slice(0, 10)} == NotSlashableExplicitRevert.selector ${iface.getError('NotSlashableExplicitRevert')!.selector}`);
    }
  }
  const claimId = await court.claimIdOf(KEY, d.headerNumber, d.txIndex);
  const c = await court.claim(claimId);
  console.log(`\n  nothing was recorded: claim.ruledAt == ${c.ruledAt}  (the strict path leaves no trace)`);

  writeFileSync('evidence/34-strict-first.json', JSON.stringify({
    note: 'Corrects the ordering flaw in probe 32 step 3. The strict path must be asked BEFORE the recording path, because recording consumes the globally unique claim id.',
    sourceTx: stx.hash, sourceBlock: src!.blockNumber,
    sourceGasUsed: Number(src!.gasUsed), sourceGasLimit: 100000,
    minedTx: minedHash, explorer: minedHash ? `${EX}/tx/${minedHash}` : null,
    error: decoded, namedError: 'NotSlashableExplicitRevert',
    recordedAnything: Number(c.ruledAt) !== 0,
  }, null, 2));
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
