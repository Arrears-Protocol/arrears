import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('verify/stream', { recursive: true });
const URL = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });

// Page screenshots with a clip region — an ELEMENT screenshot pauses CSS
// animations while it waits for stability, which is why earlier stills were empty.
async function shot(p: any, sel: string, out: string) {
  const box = await (await p.$(sel))!.boundingBox();
  await p.screenshot({ path: out, clip: box!, animations: 'allow' });
}

for (const theme of ['dark', 'light'] as const) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  if (theme === 'light') { await p.evaluate(() => localStorage.setItem('theme', 'light')); await p.reload({ waitUntil: 'networkidle' }); }
  await p.waitForTimeout(18000);            // mid-cycle: the stack has built
  await shot(p, '#hero .rounded-card', `verify/stream/component-${theme}.png`);
  await p.screenshot({ path: `verify/stream/hero-${theme}.png`, animations: 'allow' });
  await c.close();
}

const rc = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const rp = await rc.newPage();
await rp.goto(URL, { waitUntil: 'networkidle' }); await rp.waitForTimeout(3000);
await shot(rp, '#hero .rounded-card', 'verify/stream/component-reduced-motion.png');
await rc.close();

const vc = await b.newContext({
  viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1,
  recordVideo: { dir: 'verify/stream/vid', size: { width: 1000, height: 700 } },
});
const vp = await vc.newPage();
await vp.goto(URL, { waitUntil: 'networkidle' });
await vp.evaluate(() => document.querySelector('#hero .rounded-card')?.scrollIntoView({ block: 'center' }));
await vp.waitForTimeout(20000);
await vc.close();
await b.close();
console.log('done');
