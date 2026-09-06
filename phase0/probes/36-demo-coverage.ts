/** Phase 0 probe 36 — top up the bond and declare the demo coverage.
 *  Coverage C over WETH.approve() at a 0.05 tCTC per-claim cap: 400 interactive slashes.
 *  A DIFFERENT selector from A and B on purpose -- the court takes the widest payable, so a
 *  small cap sharing a selector with A (cap 2.0) would lose and quietly drain the real coverage. */
import { JsonRpcProvider, Wallet, Contract, formatEther, parseEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const EX = 'https://creditcoin-testnet.blockscout.com';
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const APPROVE = '0x095ea7b3';
const KEY = 1;
const D = JSON.parse(readFileSync('evidence/31-deploy-protocol.json', 'utf8'));
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const abi = (n: string) => JSON.parse(readFileSync(`../contracts/out/${n}.sol/${n}.json`, 'utf8')).abi;
const reg = new Contract(D.registry, abi('ArrearsRegistry'), w);

async function rec(label: string, p: Promise<any>) {
  const rc = await (await p).wait();
  console.log(`  ${label.padEnd(30)} status ${rc.status}  gas ${String(rc.gasUsed).padStart(7)}  ${rc.hash}`);
  return rc;
}

async function main() {
  const before = await reg.operator(D.operatorId);
  console.log(`bonded ${formatEther(before.bonded)}  committed ${formatEther(before.committed)}  free ${formatEther(await reg.freeBond(D.operatorId))}\n`);

  const TOP_UP = parseEther('30');
  const COMMITTED = parseEther('20');
  const CAP = parseEther('0.05');
  console.log(`=== top up ${formatEther(TOP_UP)} tCTC and declare coverage C ===`);
  await rec('postBond', reg.postBond(D.operatorId, { value: TOP_UP }));

  const now = Math.floor(Date.now() / 1000);
  const rc = await rec('declareCoverage C: approve()',
    reg.declareCoverage(D.operatorId, KEY, D.window.fromHeight, 12_000_000, COMMITTED, CAP,
      now + 365 * 24 * 3600, [{ target: WETH, selector: APPROVE }]));

  const ids = await reg.coveragesOf(D.operatorId);
  const coverageC = ids[ids.length - 1];
  const after = await reg.operator(D.operatorId);
  console.log(`\n  coverage C ${coverageC}`);
  console.log(`  committed ${formatEther(COMMITTED)} at ${formatEther(CAP)} per claim = ${Number(COMMITTED / CAP)} interactive slashes`);
  console.log(`  bonded ${formatEther(after.bonded)}  committed ${formatEther(after.committed)}  free ${formatEther(await reg.freeBond(D.operatorId))}`);
  console.log(`  payable_ now: A ${formatEther(await reg.payable_(D.coverageA))}  B ${formatEther(await reg.payable_(D.coverageB))}  C ${formatEther(await reg.payable_(coverageC))}`);
  console.log(`\n  window [${D.window.fromHeight}, 12,000,000] -- deliberately wide so the pool cannot age out of it`);
  console.log(`  approve() is in NO other coverage, so selection is unambiguous and C cannot drain A or B`);

  writeFileSync('evidence/36-demo-coverage.json', JSON.stringify({
    coverageC, target: WETH, selector: APPROVE, selectorName: 'approve(address,uint256)',
    committedWei: COMMITTED.toString(), perClaimCapWei: CAP.toString(),
    maxInteractiveSlashes: Number(COMMITTED / CAP),
    fromHeight: D.window.fromHeight, toHeight: 12_000_000,
    topUpTx: null, declareTx: rc.hash, explorer: `${EX}/tx/${rc.hash}`,
    bondedWei: after.bonded.toString(), committedTotalWei: after.committed.toString(),
  }, null, 2));
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
