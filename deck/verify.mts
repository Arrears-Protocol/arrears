/**
 * Every hash on a slide, checked against the chain it names.
 *
 *   npx tsx verify.mts
 *
 * The deck fills its hashes from demo/manifest.json, so this reads the same
 * refs out of index.html, resolves them from the manifest, and asks the chain.
 * A transaction must exist AND have the status the slide claims for it — a
 * failure the deck calls a failure must have reverted, a ruling it calls mined
 * must have succeeded. Contracts must have code. The pricing curve on slide 11
 * is re-read from the deployed credit line.
 */
import { JsonRpcProvider, Contract, formatEther } from 'ethers';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(resolve(HERE, '../demo/manifest.json'), 'utf8'));
const html = readFileSync(resolve(HERE, 'index.html'), 'utf8');

const RPC = {
  cc3: new JsonRpcProvider(M.chains.cc3.rpc, undefined, { staticNetwork: true }),
  sepolia: new JsonRpcProvider(M.chains.sepolia.rpc, undefined, { staticNetwork: true }),
  mainnet: new JsonRpcProvider(M.chains.mainnet.rpc, undefined, { staticNetwork: true }),
} as const;
type Chain = keyof typeof RPC;
const get = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[/^\d+$/.test(k) ? +k : k]), o);

/** What each slide claims about each transaction. status 0 = it reverted. */
const EXPECT: Record<string, { status: 0 | 1; gasUsed?: number; gasLimit?: number; block?: number }> = {
  'exploits.halfOne.sourceTx':        { status: 0, gasUsed: 386677, gasLimit: 598875, block: 25916354 },
  'exploits.halfOne.acceptanceTx':    { status: 1 },
  'exploits.halfTwo.acceptanceTx':    { status: 1 },
  'rulings.slash.hash':               { status: 1, block: M.rulings.slash.cc3Block },
  'rulings.slash.sourceTx':           { status: 0, gasUsed: 30000, gasLimit: 30000 },
  'rulings.refusal.hash':             { status: 1, block: M.rulings.refusal.cc3Block },
  'rulings.refusal.sourceTx':         { status: 0, gasUsed: 24187, gasLimit: 100000 },
  'rulings.outOfScope.minedTx':       { status: 0, block: M.rulings.outOfScope.cc3Block },
  'rulings.outOfScope.sourceTx':      { status: 0, block: M.rulings.outOfScope.sourceBlock },
  'rulings.strictRefusal.minedTx':    { status: 0, block: M.rulings.strictRefusal.cc3Block },
  'rulings.strictRefusal.sourceTx':   { status: 0, gasUsed: 24187, gasLimit: 100000 },
};
M.gallery.items.forEach((g: any, i: number) => {
  EXPECT[`gallery.items.${i}.sourceTx`] = { status: 0, gasUsed: g.expectedGasUsed, gasLimit: g.expectedGasLimit, block: g.block };
});

// refs written literally in index.html, plus the ones its script generates
const refs = new Map<string, Chain>();
for (const m of html.matchAll(/data-ref="([^"$]+)"\s+data-chain="(\w+)"/g)) refs.set(m[1], m[2] as Chain);
M.gallery.items.forEach((_: any, i: number) => refs.set(`gallery.items.${i}.sourceTx`, 'mainnet'));
M.operator.coverages.forEach((_: any, i: number) => refs.set(`operator.coverages.${i}.target`, 'sepolia'));

/**
 * A second route, because the first one lies by omission.
 *
 * The public Sepolia RPC (publicnode) returns null for some transactions that
 * plainly exist — 0x5c02af74… and 0xdc8730cf… on the first run of this script,
 * both confirmed reverted at the slide's exact block and gas by Sepolia's
 * Blockscout and, for one of them, by a second RPC. A null from one node is
 * not "not found". So a miss falls through to the chain's Blockscout API, and
 * the line says which route answered. docs/principles.md rule 6.
 */
const BLOCKSCOUT: Record<Chain, string> = {
  cc3: 'https://creditcoin-testnet.blockscout.com',
  sepolia: 'https://eth-sepolia.blockscout.com',
  mainnet: 'https://eth.blockscout.com',
};
async function secondRoute(chain: Chain, hash: string) {
  try {
    const d: any = await (await fetch(`${BLOCKSCOUT[chain]}/api/v2/transactions/${hash}`)).json();
    if (!d?.hash) return null;
    return { status: d.status === 'ok' ? 1 : 0, gasUsed: Number(d.gas_used), gasLimit: Number(d.gas_limit),
             block: Number(d.block_number ?? d.block), via: `  (via ${new URL(BLOCKSCOUT[chain]).host}: the RPC returned nothing)` };
  } catch { return null; }
}

let fail = 0;
const ok = (s: string) => console.log(`  PASS  ${s}`);
const no = (s: string) => { fail++; console.log(`  FAIL  ${s}`); };

console.log(`${refs.size} hashes and addresses on the slides\n`);
for (const [ref, chain] of refs) {
  const v: string = get(M, ref);
  if (typeof v !== 'string') { no(`${ref} does not resolve in the manifest`); continue; }
  const tag = `${chain.padEnd(7)} ${v.slice(0, 10)}…${v.slice(-6)}  ${ref}`;

  if (v.length === 66) {
    const [r, t] = await Promise.all([RPC[chain].getTransactionReceipt(v), RPC[chain].getTransaction(v)]);
    let got = r && t ? { status: r.status, gasUsed: Number(r.gasUsed), gasLimit: Number(t.gasLimit), block: r.blockNumber, via: '' } : null;
    if (!got) got = await secondRoute(chain, v);
    if (!got) { no(`${tag} — not found on ${chain} by the RPC or by Blockscout`); continue; }
    const e = EXPECT[ref];
    const probs: string[] = [];
    if (e && got.status !== e.status) probs.push(`status ${got.status}, slide says ${e.status}`);
    if (e?.gasUsed != null && got.gasUsed !== e.gasUsed) probs.push(`gasUsed ${got.gasUsed}, slide says ${e.gasUsed}`);
    if (e?.gasLimit != null && got.gasLimit !== e.gasLimit) probs.push(`gasLimit ${got.gasLimit}, slide says ${e.gasLimit}`);
    if (e?.block != null && got.block !== e.block) probs.push(`block ${got.block}, slide says ${e.block}`);
    probs.length ? no(`${tag} — ${probs.join('; ')}${got.via}`)
                 : ok(`${tag}  status ${got.status} · block ${got.block.toLocaleString('en-US')}${e ? '' : '  (existence only)'}${got.via}`);
  } else {
    const code = await RPC[chain].getCode(v);
    const isEoa = ref === 'operator.sourceAddress';
    if (isEoa) ok(`${tag}  account${code === '0x' ? ' (no code, as expected)' : ''}`);
    else if (code === '0x') no(`${tag} — no code on ${chain}`);
    else ok(`${tag}  contract · ${(code.length - 2) / 2} bytes`);
  }
}

// slide 11: the pricing curve, read back from the contract rather than trusted from the slide
console.log('\nslide 11 · pricing curve');
const L = new Contract(M.contracts.arrearsCreditLine.address, [
  'function quote(uint256,uint16,uint32,uint64) view returns (uint256 limit, uint16 premiumBps)',
  'function terms(bytes32) view returns ((uint256 limit,uint16 premiumBps,uint32 strikes,uint64 repricedAt))',
], RPC.cc3);
const SLIDE = [[1000, 500], [750, 650], [562.5, 800], [421.875, 950], [316.40625, 1100], [237.3046875, 1250]];
for (let s = 0; s < SLIDE.length; s++) {
  const q = await L.quote(10n ** 21n, 500, s, 0);
  const [lim, prem] = SLIDE[s];
  Number(formatEther(q.limit)) === lim && Number(q.premiumBps) === prem
    ? ok(`strikes ${s}  ${formatEther(q.limit)} tCTC · ${q.premiumBps} bps`)
    : no(`strikes ${s}  chain ${formatEther(q.limit)} / ${q.premiumBps}, slide ${lim} / ${prem}`);
}
const t = await L.terms(M.operator.operatorId);
const asAt = Number((html.match(/id="asat">([\d,]+)</)?.[1] ?? '0').replace(/,/g, ''));
const now = await RPC.cc3.getBlockNumber();
Number(t.strikes) === 5
  ? ok(`demo operator at strike 5 now (block ${now.toLocaleString('en-US')}); slide stamps block ${asAt.toLocaleString('en-US')}`)
  : console.log(`  NOTE  demo operator now at strike ${t.strikes} — the slide's as-at stamp (${asAt.toLocaleString('en-US')}) is still true for its block, but re-stamp before re-printing`);

console.log(`\n${fail ? `${fail} FAILED` : 'every hash on every slide matches the chain'}`);
process.exit(fail ? 1 : 0);
