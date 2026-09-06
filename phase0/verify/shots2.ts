import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const URL = process.argv[2] ?? 'http://localhost:3000';
mkdirSync('verify/rd', { recursive: true });
const SECTIONS = [['1-hero','#hero'],['2-fault-line','#rule'],['3-outcomes','#outcomes'],['4-try-it','#try'],['5-gallery','#gallery'],['6-trust','#trust']];
const b = await chromium.launch({ channel: 'chrome' });

for (const theme of ['dark','light'] as const) {
  const ctx = await b.newContext({ viewport:{width:1440,height:1000}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil:'networkidle', timeout:60000 });
  if (theme === 'light') { await p.evaluate(() => { localStorage.setItem('theme','light'); }); await p.reload({waitUntil:'networkidle'}); }
  await p.waitForTimeout(6500);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(900);
  await p.screenshot({ path:`verify/rd/00-full-${theme}.png`, fullPage:true });
  for (const [n,s] of SECTIONS) {
    const el = await p.$(s); if (!el) { console.log('missing',s); continue; }
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await el.screenshot({ path:`verify/rd/${n}-${theme}.png` });
  }
  console.log(theme, 'done');
  await ctx.close();
}
const mc = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
const mp = await mc.newPage();
await mp.goto(URL,{waitUntil:'networkidle',timeout:60000}); await mp.waitForTimeout(5500);
await mp.evaluate(() => window.scrollTo(0, 0));
await mp.waitForTimeout(600);
await mp.screenshot({ path:'verify/rd/1-hero-mobile.png' });  // viewport at top: what a reader actually sees
await mp.setViewportSize({ width: 390, height: 1500 });
await mp.waitForTimeout(400);
await mp.screenshot({ path:'verify/rd/1-hero-mobile-tall.png' });
await mp.screenshot({ path:'verify/rd/00-full-mobile.png', fullPage:true });
console.log('mobile done');
await b.close();
