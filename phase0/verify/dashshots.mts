import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('verify/dash', { recursive: true });
const U = process.argv[2], ID = process.argv[3];
const PAGES: Array<[string, string]> = [
  ['1-overview', '/dashboard'],
  ['2-register', '/dashboard/operator/register'],
  ['3-operator', '/dashboard/operator'],
  ['4-claim', '/dashboard/claim'],
  ['5-lookup', '/dashboard/o'],
  ['6-record', `/dashboard/o/${ID}`],
];
const b = await chromium.launch({ channel: 'chrome' });
for (const theme of ['dark', 'light'] as const) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(U + '/dashboard', { waitUntil: 'networkidle' });
  if (theme === 'light') { await p.evaluate(() => localStorage.setItem('theme', 'light')); }
  for (const [name, path] of PAGES) {
    await p.goto(U + path, { waitUntil: 'networkidle' });
    await p.waitForTimeout(6500);
    await p.screenshot({ path: `verify/dash/${name}-${theme}.png`, fullPage: true });
  }
  console.log(theme, 'done');
  await c.close();
}
const m = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(U + '/dashboard', { waitUntil: 'networkidle' }); await mp.waitForTimeout(4000);
await mp.screenshot({ path: 'verify/dash/1-overview-mobile.png', fullPage: true });
await mp.goto(U + '/dashboard/operator/register', { waitUntil: 'networkidle' }); await mp.waitForTimeout(4000);
await mp.screenshot({ path: 'verify/dash/2-register-mobile.png', fullPage: true });
console.log('mobile done');
await b.close();
