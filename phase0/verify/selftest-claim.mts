import { harness, ADDR, MANIFEST as M } from './wallet-harness.mts';
import { JsonRpcProvider, Contract } from 'ethers';

const U = process.argv[2];
const ok = (s: string) => console.log(`  PASS  ${s}`);
const note = (sev: string, w: string, x: string) => console.log(`  ${sev}  ${w} — ${x}`);
const rpc = new JsonRpcProvider(M.chains.cc3.rpc, undefined, { staticNetwork: true });

const h = await harness({ startChain: '0x18e8f' });   // already on CC3 for this leg
const p = h.page;
p.on('pageerror', (e) => note('BREAK', 'page', `uncaught: ${e.message}`));

console.log('\n6. CLAIMANT — self-funded, preview first, beneficiary ≠ sender');
await p.goto(U + '/dashboard/claim', { waitUntil: 'networkidle' });
await p.waitForTimeout(6000);

const noReward = await p.locator(':text("nothing else")').count();
noReward ? ok('states plainly that connecting gets your address in the ruling and nothing else') : note('CONFUSING', 'claim', 'no-bounty framing missing');

await p.locator('header button:has-text("connect")').first().click();
await p.waitForTimeout(1500);

// pick an OutOfGas item so the slash path is exercised
const items = p.locator('button').filter({ hasText: /OutOfGas/ });
const n = await items.count();
console.log(`  ${n} unruled out-of-gas items offered`);
if (!n) { note('BREAK', 'claim', 'no unruled evidence offered'); await h.close(); process.exit(1); }
await items.first().click();
await p.waitForTimeout(700);

// slash-only should be selectable for OutOfGas
const slashRadio = p.locator('input[type=radio]').nth(1);
const slashEnabled = await slashRadio.isEnabled();
slashEnabled ? ok('slash-only is available for an out-of-gas failure') : note('BREAK', 'claim', 'slash-only disabled on OutOfGas');

// beneficiary: deliberately NOT the sender
const ben = ADDR('source');
const benInput = p.locator('input').filter({ hasNotText: '' }).last();
await benInput.fill(ben);
await p.waitForTimeout(400);
ok(`beneficiary set to ${ben.slice(0, 10)}… (sender is ${ADDR('controller').slice(0, 10)}…)`);

await p.locator('button:has-text("preview")').first().click();
await p.waitForTimeout(9000);
const predicted = await p.locator(':text("predicted, before any gas")').count();
predicted ? ok('free preview returned before any transaction') : note('BREAK', 'claim', 'preview did not render');

const before = await new Contract(M.contracts.arrearsCourt.address,
  ['function claimsAgainst(bytes32) view returns (bytes32[])'], rpc).claimsAgainst(M.operator.operatorId);

await p.locator('button:has-text("submit")').first().click();
await p.waitForTimeout(25000);
const mined = await p.locator(':text("mined ·")').count();
mined ? ok(`ruling mined from the user's own wallet (sends: ${h.state.sendCalls})`) : note('BREAK', 'claim', 'submission did not confirm');

const after = await new Contract(M.contracts.arrearsCourt.address,
  ['function claimsAgainst(bytes32) view returns (bytes32[])',
   'function claim(bytes32) view returns ((bytes32,bytes32,bytes32,uint64,uint64,uint64,address,bytes4,uint64,uint64,uint8,uint256,address,uint64))'], rpc)
  .claimsAgainst(M.operator.operatorId);
if (after.length > before.length) {
  const c = await new Contract(M.contracts.arrearsCourt.address,
    ['function claim(bytes32) view returns ((bytes32 a,bytes32 b,bytes32 c,uint64 d,uint64 e,uint64 f,address g,bytes4 h,uint64 i,uint64 j,uint8 k,uint256 l,address beneficiary,uint64 m))'], rpc)
    .claim(after[after.length - 1]);
  const credited = c.beneficiary.toLowerCase() === ben.toLowerCase();
  credited ? ok(`the ruling credits the beneficiary we named, not the sender (${c.beneficiary.slice(0, 10)}…)`)
           : note('BREAK', 'claim', `ruling credited ${c.beneficiary} but we asked for ${ben}`);
} else note('BREAK', 'claim', 'no new claim appeared on chain');

await p.screenshot({ path: 'verify/selftest-claim.png', fullPage: true });
await h.close();
