import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await c.newPage();
const id = process.argv[3];
await p.goto(`${process.argv[2]}/dashboard/o/${id}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(7000);
const t = (await p.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
for (const [n, s] of [['bonded', 'bonded'], ['credit terms', 'Credit terms'], ['coverage', 'Coverage ·'],
                      ['claims table', 'Claims on record'], ['tCTC figure', 'tCTC']] as const)
  console.log(`  ${t.includes(s) ? 'PASS' : 'FAIL'}  ${n}`);
console.log(`  ${!t.includes('wallet required') ? 'PASS' : 'FAIL'}  no wallet prompt on the record view`);
await b.close();
