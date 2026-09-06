import { harness, ADDR, MANIFEST as M } from './harness.mts';
const U = process.argv[2];
const ok = (s: string) => console.log(`  PASS  ${s}`);
const bad = (s: string) => console.log(`  FAIL  ${s}`);

// A. the deployer controls TWO operators — the picker must appear and both must resolve
console.log('\nA. controller of two operators');
const h = await harness({ startChain: '0x18e8f' });
// A fresh browser genuinely does not know operator 2 — no enumerable list exists.
// Seed it the way a real user would: the wizard records it, or a lookup finds it.
await h.page.goto(U + '/dashboard/operator', { waitUntil: 'networkidle' });
await h.page.evaluate(() => localStorage.setItem('arrears.knownOperatorIds.v1',
  JSON.stringify(['0x9835345a40a38f2cfcb94e5774ad8bad9e3aaa9d5715fba5c46c27778ba230ff'])));
await h.page.reload({ waitUntil: 'networkidle' });
await h.page.waitForTimeout(2000);
await h.page.locator('header button:has-text("connect")').first().click();
await h.page.waitForTimeout(11000);
let t = (await h.page.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/controls 2 operators/.test(t) ? ok('picker shows both operators') : bad(`picker missing — "${t.match(/controls \d+ operators/)?.[0] ?? 'none'}"`);
/No operator found/.test(t) ? bad('landed on the empty state despite controlling two') : ok('did not land on an empty state');
// switch to the second and confirm its record loads
const chips = h.page.locator('button').filter({ hasText: /^0xc0F6/ });
if (await chips.count()) {
  await chips.first().click(); await h.page.waitForTimeout(6000);
  t = (await h.page.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  /No coverage declared/.test(t) ? ok('second operator resolves and shows its (empty) coverage honestly') : bad('second operator did not resolve');
} else bad('no chip for the second operator');
await h.page.screenshot({ path: 'out/multiop.png', fullPage: true });
await h.close();

// B. a stranger's account: empty state must offer the lookup, not a dead end
console.log('\nB. an account controlling nothing');
const h2 = await harness({ startChain: '0x18e8f' });
await h2.setAccount('source');           // 0xc0F6… is a SOURCE, controls nothing
await h2.page.goto(U + '/dashboard/operator', { waitUntil: 'networkidle' });
await h2.page.waitForTimeout(2000);
await h2.page.locator('header button:has-text("connect")').first().click();
await h2.page.waitForTimeout(9000);
const t2 = (await h2.page.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/No operator found/.test(t2) ? ok('clear empty state') : bad('no empty state shown');
/find my operator/.test(t2) ? ok('offers a source-address lookup rather than dead-ending') : bad('no lookup offered');
/register an operator/.test(t2) ? ok('offers registration') : bad('no registration link');
await h2.close();

// C. the public record view for BOTH operators
console.log('\nC. public record, no wallet, both operators');
const h3 = await harness();
for (const [label, id] of [['manifest operator', M.operator.operatorId],
  ['second operator', '0x9835345a40a38f2cfcb94e5774ad8bad9e3aaa9d5715fba5c46c27778ba230ff']] as const) {
  await h3.page.goto(`${U}/dashboard/o/${id}`, { waitUntil: 'networkidle' });
  await h3.page.waitForTimeout(7000);
  const c = (await h3.page.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const rendered = /bonded/.test(c) && /Credit terms/.test(c);
  const noPrompt = !/wallet required/i.test(c);
  rendered && noPrompt ? ok(`${label} renders with no wallet`) : bad(`${label} did not render cleanly`);
}
await h3.close();
