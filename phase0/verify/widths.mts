import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
for (const vw of [1440, 1920]) {
  const c = await b.newContext({ viewport: { width: vw, height: 1000 } });
  const p = await c.newPage();
  for (const [label, path, sel] of [
    ['landing (doc measure)', '/', 'section#hero > div'],
    ['dashboard (console)', '/dashboard', 'main, body > div'],
  ] as const) {
    await p.goto(process.argv[2] + path, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const w = await p.evaluate(() => {
      const el = document.querySelector('header')?.firstElementChild as HTMLElement;
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    });
    console.log(`  ${String(vw).padEnd(5)} ${label.padEnd(24)} container ${w}px`);
  }
  await c.close();
}
await b.close();
