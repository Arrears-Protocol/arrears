/** Full-page and per-section screenshots of the deployed site, for design review.
 *  Desktop width for everything, plus the hero at mobile width. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2];
if (!URL) { console.error('usage: shots.ts <url>'); process.exit(1); }
mkdirSync('verify/shots', { recursive: true });

const SECTIONS = [
  ['1-hero', '#hero'],
  ['2-fault-line', '#rule'],
  ['3-outcomes', '#outcomes'],
  ['4-try-it', '#try'],
  ['5-gallery', '#gallery'],
  ['6-trust', '#trust'],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  // desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(6000); // let the live confirmation marks land

  await page.screenshot({ path: 'verify/shots/00-full-page-desktop.png', fullPage: true });
  console.log('  00-full-page-desktop.png');
  for (const [name, sel] of SECTIONS) {
    const el = await page.$(sel);
    if (!el) { console.log(`  MISSING ${sel}`); continue; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await el.screenshot({ path: `verify/shots/${name}-desktop.png` });
    console.log(`  ${name}-desktop.png`);
  }
  await ctx.close();

  // mobile hero
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  await mpage.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await mpage.waitForTimeout(5000);
  const hero = await mpage.$('#hero');
  if (hero) { await hero.screenshot({ path: 'verify/shots/1-hero-mobile.png' }); console.log('  1-hero-mobile.png'); }
  await mpage.screenshot({ path: 'verify/shots/00-full-page-mobile.png', fullPage: true });
  console.log('  00-full-page-mobile.png');
  await mctx.close();

  await browser.close();
  console.log('\ndone');
})();
