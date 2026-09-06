import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
for (const path of ['/', '/dashboard', '/dashboard/operator/register', '/dashboard/claim']) {
  await p.goto(process.argv[2] + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`  ${over <= 1 ? 'PASS' : 'FAIL'}  ${path.padEnd(32)} horizontal overflow ${over}px`);
}
await b.close();
