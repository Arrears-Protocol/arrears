/** Production verification with JavaScript DISABLED.
 *  The claim is that the static shell carries the whole argument, so this loads the deployed
 *  page with JS off and asserts every essential element is present in the HTML with no live
 *  call resolved. Anything that only appears after hydration is a defect, not a nuance. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2];
if (!URL) { console.error('usage: nojs.ts <url>'); process.exit(1); }

const MUST_CONTAIN: Array<[string, string]> = [
  ['hero: opens on a refusal',        'A real failure. A bonded operator. Turned away.'],
  ['hero axis 1 operator',            'operator'],
  ['hero axis 2 chain',               'Ethereum Sepolia'],
  ['hero axis 3 window',              'window'],
  ['hero axis 4 contract',            'WETH9 — covered'],
  ['hero axis 5 selector MISSED',     'NOT IN SCOPE'],
  ['hero: refusal error named',       'OutOfScope'],
  ['fault line',                      'gasUsed >= gasLimit'],
  ['ledger delta 1: bond moved',      'Bond moved'],
  ['ledger delta 2: record kept',     'Record kept'],
  ['ledger delta 3: turned away',     'Turned away'],
  ['refusal framed as working',       'a refusal is the system working'],
  ['ruling hash 1 (slash)',           '0xa7b1e50e'],
  ['ruling hash 2 (refusal)',         '0xe585da11'],
  ['ruling hash 3 (out of scope)',    '0xd9f96284'],
  ['ruling hash 4 (strict)',          '0xc0bf98c0'],
  ['gallery',                         'Seven real mainnet failures'],
  ['trust assumption named',          'the precompile does not verify it'],
  ['settlement framing',              'Settlement-time, not interception'],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 1200 } });
  const page = await ctx.newPage();
  const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  console.log(`GET ${URL} -> HTTP ${resp?.status()}  (JavaScript DISABLED)\n`);

  const html = await page.content();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
                   .replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, ' ');

  let bad = 0;
  for (const [name, needle] of MUST_CONTAIN) {
    const ok = text.includes(needle) || html.includes(needle);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — missing: ${needle}`}`);
    if (!ok) bad++;
  }

  /* ── VISIBILITY, not just presence ───────────────────────────────────────
     The content assertions above passed on a build where every section was
     rendered at opacity 0 by a scroll-reveal that serialised its hidden state
     into the HTML. The page was blank and the suite was green. Presence in the
     DOM is not the claim being made; a reader seeing it is. */
  console.log('');
  for (const [name, sel] of [
    ['hero', '#hero'], ['fault line', '#rule'], ['outcomes', '#outcomes'],
    ['try it', '#try'], ['gallery', '#gallery'], ['trust', '#trust'],
  ] as const) {
    const el = page.locator(sel).first();
    const shown = await el.isVisible().catch(() => false);
    const opacity = await el.evaluate((e) => {
      let o = 1, x: Element | null = e;
      while (x) { o *= parseFloat(getComputedStyle(x).opacity || '1'); x = x.parentElement; }
      return o;
    }).catch(() => 0);
    const ok = shown && opacity > 0.05;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} is VISIBLE with JS off  (effective opacity ${opacity.toFixed(2)})`);
    if (!ok) bad++;
  }
  console.log('');

  const bs = (html.match(/creditcoin-testnet\.blockscout\.com\/(tx|address)\//g) ?? []).length;
  const es = (html.match(/etherscan\.io\/(tx|address)\//g) ?? []).length;
  console.log(`\n  deep links present with JS off: ${bs} Blockscout, ${es} Etherscan`);
  if (bs === 0 || es === 0) bad++;

  await page.screenshot({ path: 'verify/nojs-full.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'verify/nojs-hero.png' });
  console.log('  screenshots: verify/nojs-full.png, verify/nojs-hero.png');

  writeFileSync('verify/nojs-report.json', JSON.stringify({
    url: URL, status: resp?.status(), javaScriptEnabled: false,
    checks: MUST_CONTAIN.map(([n, s]) => ({ name: n, present: text.includes(s) || html.includes(s) })),
    blockscoutLinks: bs, etherscanLinks: es, failures: bad, at: new Date().toISOString(),
  }, null, 2));

  await browser.close();
  console.log(bad === 0
    ? '\n  THE STATIC SHELL CARRIES THE ARGUMENT — nothing essential needs hydration.'
    : `\n  ${bad} FAILED — fix before moving on.`);
  process.exit(bad ? 1 : 0);
})();
