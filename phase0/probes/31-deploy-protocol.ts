/** Phase 0 probe 31 — deploy the Arrears protocol on CC3 and stand up the operator.
 *  Registry, credit line, court. Register the Sepolia operator against a signature from the
 *  key that address actually controls, bond it, open a line, declare coverage. */
import { JsonRpcProvider, Wallet, ContractFactory, Contract, formatEther, parseEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DECODER = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const ART = '../contracts/out';
const EX = 'https://creditcoin-testnet.blockscout.com';
const SEPOLIA_KEY = 1;
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const DEPOSIT = '0xd0e30db0';
const TRANSFER = '0xa9059cbb';

const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const deployer = new Wallet(kf.accounts.deployer.privateKey, CC3);   // the Creditcoin controller
const opKey = new Wallet(kf.accounts.operator.privateKey);           // the Sepolia key, signs only
const TREASURY = kf.accounts.treasury.address;

const UNBONDING = 7 * 24 * 3600;
const MIN_CHALLENGE = 24 * 3600;
const DECAY = 0; // strikes never decay

function load(name: string) {
  const a = JSON.parse(readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8'));
  const bc = a.bytecode.object.replace(/__\$[0-9a-f]{34}\$__/g, DECODER.slice(2).toLowerCase());
  if (/__\$/.test(bc)) throw new Error(`${name}: unlinked`);
  return { abi: a.abi, bytecode: bc };
}
const log: any[] = [];
async function rec(label: string, p: Promise<any>) {
  const tx = await p;
  const rc = await tx.wait();
  const row = { step: label, hash: rc.hash, status: rc.status, gasUsed: Number(rc.gasUsed),
                cost: formatEther(rc.gasUsed * (rc.gasPrice ?? 0n)) };
  log.push(row);
  console.log(`  ${label.padEnd(34)} status ${rc.status}  gas ${String(row.gasUsed).padStart(7)}  ${row.cost} tCTC`);
  console.log(`  ${''.padEnd(34)} ${EX}/tx/${rc.hash}`);
  return rc;
}
async function deploy(name: string, args: any[] = []) {
  const { abi, bytecode } = load(name);
  const c = await new ContractFactory(abi, bytecode, deployer).deploy(...args);
  const rc = await c.deploymentTransaction()!.wait();
  const addr = await c.getAddress();
  log.push({ step: `deploy ${name}`, hash: rc!.hash, status: rc!.status, gasUsed: Number(rc!.gasUsed),
             cost: formatEther(rc!.gasUsed * (rc!.gasPrice ?? 0n)), address: addr });
  console.log(`  ${name.padEnd(20)} ${addr}`);
  console.log(`  ${''.padEnd(20)} gas ${rc!.gasUsed}  ${formatEther(rc!.gasUsed * (rc!.gasPrice ?? 0n))} tCTC  ${rc!.hash}`);
  return { addr, abi, contract: new Contract(addr, abi, deployer) };
}

async function main() {
  console.log(`deployer/controller ${deployer.address}  ${formatEther(await CC3.getBalance(deployer.address))} tCTC`);
  console.log(`operator (Sepolia)  ${opKey.address}`);
  console.log(`treasury            ${TREASURY}\n`);

  console.log('=== 1. deploy ===');
  const reg = await deploy('ArrearsRegistry', [UNBONDING, MIN_CHALLENGE, TREASURY]);
  const line = await deploy('ArrearsCreditLine', [DECAY]);
  const court = await deploy('ArrearsCourt', [reg.addr, line.addr]);

  console.log('\n=== 2. wire ===');
  await rec('registry.setCourt', reg.contract.setCourt(court.addr));
  await rec('creditLine.setCourt', line.contract.setCourt(court.addr));

  console.log('\n=== 3. register the operator ===');
  const digest = await reg.contract.registrationDigest(deployer.address, opKey.address, SEPOLIA_KEY);
  const sig = opKey.signingKey.sign(digest).serialized; // signed by the Sepolia key itself
  console.log(`  digest    ${digest}`);
  console.log(`  signed by ${opKey.address} (the address the bond will answer for)`);
  await rec('registry.registerOperator', reg.contract.registerOperator(opKey.address, SEPOLIA_KEY, sig));
  const operatorId = await reg.contract.operatorIdOf(SEPOLIA_KEY, opKey.address);
  console.log(`  operatorId ${operatorId}`);

  console.log('\n=== 4. bond and open a line ===');
  await rec('registry.postBond (20 tCTC)', reg.contract.postBond(operatorId, { value: parseEther('20') }));
  await rec('creditLine.openLine', line.contract.openLine(operatorId, parseEther('1000'), 500));

  console.log('\n=== 5. declare coverage ===');
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 365 * 24 * 3600;
  const FROM = 11_646_000, TO = 11_700_000;
  const rcA = await rec('coverage A: WETH.deposit()',
    reg.contract.declareCoverage(operatorId, SEPOLIA_KEY, FROM, TO, parseEther('5'), parseEther('2'), deadline,
      [{ target: WETH, selector: DEPOSIT }]));
  const rcB = await rec('coverage B: WETH.transfer()',
    reg.contract.declareCoverage(operatorId, SEPOLIA_KEY, FROM, TO, parseEther('5'), parseEther('2'), deadline,
      [{ target: WETH, selector: TRANSFER }]));
  const ids = await reg.contract.coveragesOf(operatorId);
  console.log(`  coverages ${ids.length}: A=${ids[0]}  B=${ids[1]}`);
  console.log(`  window [${FROM}, ${TO}]  contains 11,646,331 (the OOG) and 11,646,964 (the revert)`);
  console.log(`  WETH.withdraw() is in NEITHER -> the out-of-scope claim will report Selector`);

  const op = await reg.contract.operator(operatorId);
  console.log(`\n  bonded ${formatEther(op.bonded)}  committed ${formatEther(op.committed)}  free ${formatEther(await reg.contract.freeBond(operatorId))}`);

  writeFileSync('evidence/31-deploy-protocol.json', JSON.stringify({
    chain: 'cc3-testnet', chainId: 102031,
    registry: reg.addr, creditLine: line.addr, court: court.addr,
    treasury: TREASURY, controller: deployer.address, operatorSourceAddress: opKey.address,
    operatorId, coverageA: ids[0], coverageB: ids[1],
    window: { fromHeight: FROM, toHeight: TO }, claimDeadline: deadline,
    params: { unbondingPeriod: UNBONDING, minChallengePeriod: MIN_CHALLENGE, decayHalfLifeSeconds: DECAY },
    bondedWei: op.bonded.toString(), perClaimCapWei: parseEther('2').toString(),
    transactions: log,
  }, null, 2));
  const total = log.reduce((a, r) => a + parseFloat(r.cost), 0);
  console.log(`\ntotal deployment + setup cost: ${total.toFixed(8)} tCTC across ${log.length} transactions`);
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
