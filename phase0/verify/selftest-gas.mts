import { harness, ADDR } from './wallet-harness.mts';
const U = process.argv[2];
// 'source' holds 0 tCTC — exactly what an external participant arrives with
const h = await harness({ startChain: '0x18e8f' });
await h.setAccount('source');
const p = h.page;
await p.goto(U + '/dashboard/claim', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
await p.locator('header button:has-text("connect")').first().click();
await p.waitForTimeout(3000);
const t = (await p.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const checks: Array<[string, boolean]> = [
  ['tells the user they have no testnet CTC', /no testnet CTC in this wallet/i.test(t)],
  ['names the Discord faucet as the only route', /discord\.gg\/creditcoin/.test(t) && /Discord-only/.test(t)],
  ['gives the exact command with their address', t.includes(`/faucet address:${ADDR('source')}`)],
  ['says reading still works', /need no wallet and no balance/i.test(t)],
  ['no transaction was attempted', h.state.sendCalls === 0],
];
for (const [n, v] of checks) console.log(`  ${v ? 'PASS' : 'FAIL'}  ${n}`);
await p.screenshot({ path: 'verify/selftest-gas.png', fullPage: true });
await h.close();
