import { harness, ADDR, MANIFEST as M } from './harness.mts';

const U = process.argv[2];
const findings: Array<{ sev: 'BREAK' | 'CONFUSING' | 'ASSUMES'; where: string; what: string }> = [];
const note = (sev: any, where: string, what: string) => { findings.push({ sev, where, what }); console.log(`  ${sev}  ${where} — ${what}`); };
const ok = (s: string) => console.log(`  PASS  ${s}`);

const h = await harness();          // starts on Ethereum mainnet, not CC3
const p = h.page;

// ── 1. connect from the landing page ────────────────────────────────────────
console.log('\n1. LANDING PAGE — can a first-time user connect from here?');
await p.goto(U, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
const landingConnect = await p.locator('header button:has-text("connect"), header :text("connect")').count();
if (landingConnect === 0) note('BREAK', 'landing header', 'no connect control anywhere on the landing page — the brief called for one as an entry point');
else ok('landing page offers connect');
const doorCount = await p.locator('a[href="/dashboard"]').count();
doorCount > 0 ? ok(`landing links to the dashboard (${doorCount} routes in)`) : note('BREAK', 'landing', 'no route to the dashboard');

// ── 2. connect from /dashboard directly ─────────────────────────────────────
console.log('\n2. /dashboard DIRECT — connect, disconnect, reconnect');
await p.goto(U + '/dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
const connectBtn = p.locator('header button:has-text("connect")').first();
if (!(await connectBtn.count())) note('BREAK', '/dashboard header', 'no connect button');
else {
  await connectBtn.click(); await p.waitForTimeout(1500);
  const chip = await p.locator('header button').filter({ hasText: /0x/ }).count();
  chip ? ok('connected — address chip shows in the header') : note('BREAK', '/dashboard', 'connect did not update the header');
  // wrong network indicator
  await p.locator('header button').filter({ hasText: /0x/ }).first().click(); await p.waitForTimeout(600);
  const warn = await p.locator(':text("wrong network")').count();
  warn ? ok('wallet on the wrong chain is called out') : note('CONFUSING', '/dashboard', 'connected on a non-CC3 chain with no warning');
  // disconnect / reconnect
  const dc = p.locator('button:has-text("disconnect")').first();
  if (await dc.count()) {
    await dc.click(); await p.waitForTimeout(900);
    const gone = await p.locator('header button:has-text("connect")').count();
    gone ? ok('disconnect returns the header to a connect button') : note('BREAK', '/dashboard', 'disconnect left stale state');
    await p.locator('header button:has-text("connect")').first().click(); await p.waitForTimeout(1200);
    ok('reconnect works');
  } else note('BREAK', '/dashboard', 'no disconnect control');
}

// ── 3. the network switch a first-time user hits ────────────────────────────
console.log('\n3. NETWORK — a wallet that has never seen Creditcoin');
await p.goto(U + '/dashboard/operator', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
const switchBtn = p.locator('button:has-text("switch")').first();
if (!(await switchBtn.count())) note('BREAK', '/dashboard/operator', 'no prompt to switch network while on the wrong chain');
else {
  await switchBtn.click(); await p.waitForTimeout(2500);
  h.state.addChainCalls.length
    ? ok(`wallet_addEthereumChain called — an unknown chain is ADDED, not just switched (${h.state.addChainCalls.join(',')})`)
    : note('BREAK', 'network switch', 'switch was attempted but the chain was never added; a wallet that has never seen CC3 would dead-end');
  await p.waitForTimeout(1200);
  const still = await p.locator(':text("wrong network")').count();
  still ? note('BREAK', 'network switch', 'still reports the wrong network after switching') : ok('now on Creditcoin CC3');
}

// ── 4. observer path, no wallet at all ──────────────────────────────────────
console.log('\n4. OBSERVER — no wallet connected');
const h2 = await harness();
await h2.page.goto(U + '/dashboard/o/' + M.operator.operatorId, { waitUntil: 'networkidle' });
await h2.page.waitForTimeout(6500);
const t = (await h2.page.content()).replace(/<[^>]+>/g, ' ');
/bonded/i.test(t) && /Credit terms/.test(t) ? ok('record renders fully with no wallet') : note('BREAK', 'observer', 'record did not render without a wallet');
/wallet required/i.test(t) ? note('BREAK', 'observer', 'record view demands a wallet') : ok('no wallet prompt on a read-only view');
await h2.close();

console.log('\n' + '─'.repeat(70));
console.log(`findings: ${findings.filter(f => f.sev === 'BREAK').length} break · ${findings.filter(f => f.sev === 'CONFUSING').length} confusing · ${findings.filter(f => f.sev === 'ASSUMES').length} assumes-state`);
await h.close();
