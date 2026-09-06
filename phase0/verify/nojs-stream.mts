import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const c = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
const p = await c.newPage();
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(9000);
const r = await p.evaluate(() => {
  const marks = Array.from(document.querySelectorAll('.fs-land'));
  const shown = marks.filter((m) => parseFloat(getComputedStyle(m).opacity) > 0.5).length;
  const flood = document.querySelector('.fs-flood');
  return { marksInDom: marks.length, visibleNow: shown,
           floodAnimating: flood ? getComputedStyle(flood).animationName : 'none' };
});
console.log(JSON.stringify(r));
await b.close();
