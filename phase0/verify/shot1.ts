import { chromium } from 'playwright';
const [url, out, w, h] = [process.argv[2], process.argv[3], +(process.argv[4]||1440), +(process.argv[5]||1000)];
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 } as any);
await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log('->', out);
