import { harness, ADDR, MANIFEST as M } from './harness.mts';
import { JsonRpcProvider, Contract, formatEther } from 'ethers';
import { readFileSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path';

const U = process.argv[2];
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const rpc = new JsonRpcProvider(M.chains.cc3.rpc, M.chains.cc3.chainId, { staticNetwork: true });
const out: string[] = [];
const note = (s: string, w: string, x: string) => { out.push(`${s}|${w}|${x}`); console.log(`  ${s}  ${w} — ${x}`); };
const ok = (s: string) => console.log(`  PASS  ${s}`);

// The source key needs no gas — it only signs. The controller pays.
console.log('balances:');
console.log('  controller', formatEther(await rpc.getBalance(ADDR('controller'))), 'tCTC');
console.log('  source    ', formatEther(await rpc.getBalance(ADDR('source'))), 'tCTC (signs only, needs none)');

// An operator id is derived from (chainKey, sourceAddress), so this leg binds a
// given source key exactly once. On a re-run the wizard is still walked in full —
// only the final send is skipped, because a duplicate would revert. Point
// `source` at a fresh key in the keyfile to walk the submit itself again.
const registry = new Contract(M.contracts.arrearsRegistry.address, [
  'function operatorIdOf(uint64,address) pure returns (bytes32)',
  'function isRegistered(bytes32) view returns (bool)',
], rpc);
const already: boolean = await registry.isRegistered(
  await registry.operatorIdOf(M.operator.chainKey, ADDR('source')));
if (already) console.log('  note: source address already registered — the submit step will be skipped, not failed');

const h = await harness({ startChain: '0x1' });
const p = h.page;
p.on('pageerror', (e) => note('BREAK', 'page', `uncaught: ${e.message}`));

// ── registration, two wallets ───────────────────────────────────────────────
console.log('\n5. OPERATOR REGISTRATION — two wallets, end to end');
await p.goto(U + '/dashboard/operator/register', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const readable = await p.locator(':text("one thing in Arrears the precompile")').count();
readable ? ok('the explanation renders before connecting') : note('BREAK', 'wizard', 'explanation hidden pre-connect');

await p.locator('header button:has-text("connect")').first().click(); await p.waitForTimeout(1500);
await h.setAccount('source');   // start on the SOURCE wallet, as a user would to sign

const inputs = p.locator('input[placeholder="0x…"]');
await inputs.nth(0).fill(ADDR('source'));
await inputs.nth(1).fill(ADDR('controller'));
await p.locator('button:has-text("compute the digest")').click();
await p.waitForTimeout(3500);

const verified = await p.locator(':text("verified against the deployed registry")').count();
verified ? ok('digest pair verified against the deployed registry before signing') : note('BREAK', 'wizard', 'digest not verified against the contract');

const signBtn = p.locator('button:has-text("sign the digest")').first();
if (!(await signBtn.count())) note('BREAK', 'wizard', 'no sign button after computing the digest');
else {
  await signBtn.click(); await p.waitForTimeout(2500);
  const signed = await p.locator('button:has-text("signed")').count();
  signed ? ok(`signed by the source key (personal_sign calls: ${h.state.signCalls})`) : note('BREAK', 'wizard', 'signature step did not complete');
}

// switch to the controller and submit — the second wallet
await h.setAccount('controller');
await p.waitForTimeout(800);

// Regression guard. Step 3's button once read "switch to Creditcoin CC3" while
// disabled, so it named an action it could not perform. It must now act.
const step3 = p.locator('button:has-text("register operator"), button:has-text("switch to Creditcoin")').first();
if (/switch to Creditcoin/.test((await step3.textContent()) ?? '')) {
  if (await step3.isDisabled()) note('BREAK', 'wizard step 3', 'button names "switch to Creditcoin CC3" but is disabled — a control that names an action must perform it');
  else {
    await step3.click(); await p.waitForTimeout(4000);
    h.state.switchCalls.length ? ok('step 3 switched the chain from the button that names it')
                               : note('BREAK', 'wizard step 3', 'clicking the switch button requested no chain switch');
  }
}
await p.waitForTimeout(1200);

const reg = p.locator('button:has-text("register operator")').first();
if (!(await reg.count()) || !(await reg.isEnabled())) {
  note('BREAK', 'wizard step 3', `register button unavailable or disabled (label: "${await reg.textContent().catch(() => 'n/a')}")`);
} else if (already) {
  ok('stopped short of a duplicate registration — this source address is already bound');
} else {
  await reg.click(); await p.waitForTimeout(20000);
  const bound = await p.locator(':text("bound on chain")').count();
  bound ? ok(`operator registered on chain (eth_sendTransaction calls: ${h.state.sendCalls})`) : note('BREAK', 'wizard', 'submit did not confirm');
}

console.log('\n' + '─'.repeat(70));
console.log(`writes walked. signs=${h.state.signCalls} sends=${h.state.sendCalls} addChain=${h.state.addChainCalls.length} switch=${h.state.switchCalls.length}`);
await p.screenshot({ path: 'out/selftest-register.png', fullPage: true });
await h.close();
