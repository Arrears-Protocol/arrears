import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const [path, expect] of [
  ['/dashboard', 'Overview'],
  ['/dashboard/operator', 'Operator'],
  ['/dashboard/operator/register', 'Operator'],
  ['/dashboard/claim', 'Claimant'],
  ['/dashboard/o', 'Look up a record'],
] as const) {
  await p.goto(process.argv[2] + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  const active = await p.$$eval('nav a', (as) =>
    as.filter((a) => a.className.includes('text-fg') && !a.className.includes('text-fg-3')).map((a) => a.textContent?.replace('›', '').trim()));
  const ok = active.length === 1 && active[0] === expect;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${path.padEnd(30)} active=[${active.join(', ')}] expected=${expect}`);
}
await b.close();
