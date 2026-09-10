/**
 * Print the deck to PDF, both themes, and a PNG per slide for review.
 *
 *   npx tsx render.mts            → ../web/public/arrears-deck.pdf (dark, the submission copy)
 *                                   ../web/public/arrears-deck-light.pdf
 *                                   out/<theme>-NN.png
 *
 * It refuses to print a deck with an unfilled hash. Every hash on a slide is a
 * data-ref into demo/manifest.json; one that did not resolve would print as an
 * empty link, which on a submission deck is worse than no link at all.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(resolve(HERE, '../demo/manifest.json'), 'utf8'));
const PUBLIC = resolve(HERE, '../web/public');
const OUT = resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const short = (v: string) => v.slice(0, 10) + '…' + v.slice(-6);

const browser = await chromium.launch();
for (const theme of ['dark', 'light'] as const) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // A STRING, not a function. tsx rewrites function bodies and injects a __name
  // helper that does not exist in the browser — docs/principles.md rule 6.
  await page.addInitScript({ content: `window.__M = ${JSON.stringify(M)};` });
  await page.goto(`file://${resolve(HERE, 'index.html')}?theme=${theme}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('html[data-filled="1"]');

  const refs = await page.$$eval('[data-ref]', (els) =>
    els.map((e) => ({ ref: (e as HTMLElement).dataset.ref!, hash: (e as HTMLElement).dataset.hash ?? '',
                      text: e.textContent ?? '', full: e.hasAttribute('data-full'), label: !/^0x/.test(e.textContent ?? '') })));
  const bad = refs.filter((r) => !r.hash || (!r.label && r.text !== (r.full ? r.hash : short(r.hash))));
  if (bad.length) { console.error('UNFILLED OR MISMATCHED HASHES:', bad); process.exit(1); }

  const nums = await page.$$eval('[data-num]', (els) => els.filter((e) => !(e as HTMLElement).dataset.value).map((e) => (e as HTMLElement).dataset.num));
  if (nums.length) { console.error('UNFILLED NUMBERS:', nums); process.exit(1); }

  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  for (const need of ['Instrument Serif', 'Inter Tight', 'JetBrains Mono'])
    if (!fonts.some((f) => f.includes(need))) { console.error(`FONT NOT LOADED: ${need}`); process.exit(1); }

  const slides = await page.locator('.slide').count();
  for (let i = 0; i < slides; i++)
    await page.locator('.slide').nth(i).screenshot({ path: `${OUT}/${theme}-${String(i + 1).padStart(2, '0')}.png` });

  const pdf = `${PUBLIC}/arrears-deck${theme === 'light' ? '-light' : ''}.pdf`;
  await page.pdf({ path: pdf, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  console.log(`${theme.padEnd(5)}  ${slides} slides · ${refs.length} hashes filled and matched · fonts ok → ${pdf}`);
  await page.close();
}
await browser.close();
