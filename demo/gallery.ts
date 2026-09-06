/**
 * Arrears — the evidence gallery, verified live.
 *
 * Seven real Ethereum mainnet failures (2023–2025) plus the live Sepolia slash artifact, each
 * proven through the block-prover precompile and classified by the DEPLOYED VerdictProbe on CC3.
 *
 * The gallery and the Sepolia slash run the identical verification path — the probe classifies
 * with `ArrearsVerdict`, the same library `ArrearsCourt` uses to reach a ruling. The gallery
 * shows that path giving the right answer against real failures at real scale; Sepolia shows
 * the slash it leads to, end to end.
 *
 *   npm install && npm run gallery
 *
 * No key, no funding, no .env. Everything is a proof request and an eth_call.
 */
import { JsonRpcProvider, Contract } from 'ethers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { proofProvider } from '@gluwa/usc-sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const CC3 = new JsonRpcProvider(process.env.CC3_RPC ?? M.chains.cc3.rpc);

const PROBE_ABI = [
  'function read(uint64 chainKey, uint64 height, bytes txBytes, (bytes32,(bytes32,bool)[]) merkleProof, (bytes32,bytes32[]) continuityProof) view returns ((bool proofValid, uint8 verdict, uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit, uint256 logCount, address from, address target, bytes4 selector, uint64 txIndex))',
];
const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];

const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  if (!ok) failures++;
  console.log(`     ${ok ? g('PASS') : r('FAIL')}  ${label}${detail ? dim('  ' + detail) : ''}`);
}

async function classify(chainKey: number, sourceTx: string, probe: Contract) {
  const builder = new proofProvider.service.ProofBuilder(chainKey, process.env.PROVER ?? M.prover, 120000);
  const res = await builder.getProof(sourceTx);
  if (!res.success) return null;
  const d: any = res.data;
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  const out = await probe.read(chainKey, d.headerNumber, d.txBytes, mp, cp);
  return { out, height: Number(d.headerNumber), contRoots: d.continuityProof.roots.length };
}

async function main() {
  console.log(b('\nArrears — evidence gallery, verified live'));
  console.log(dim(`Classified by the deployed VerdictProbe at ${M.contracts.verdictProbe.address}`));
  console.log(dim('The same ArrearsVerdict library ArrearsCourt uses to rule. Nothing here is a fixture.\n'));

  const probe = new Contract(M.contracts.verdictProbe.address, PROBE_ABI, CC3);
  const code = await CC3.getCode(M.contracts.verdictProbe.address);
  check(code.length > 2, `VerdictProbe is deployed on CC3`, `${(code.length - 2) / 2} bytes`);

  // ── the live slash artifact ──────────────────────────────────────────────
  console.log(b('\n  THE SLASH — Ethereum Sepolia, an operator whose key we hold'));
  console.log(dim('  ─'.repeat(37)));
  const s = M.slash;
  console.log(`  ${s.targetName}.${s.selectorName} — needed ${s.honestlyNeeded.toLocaleString('en-US')} gas, was sent ${s.gasLimit.toLocaleString('en-US')}`);
  console.log(`  ${M.chains.sepolia.explorer}/tx/${s.sourceTx}`);
  const sr = await classify(s.chainKey, s.sourceTx, probe);
  if (!sr) { check(false, 'proof available'); }
  else {
    const v = VERDICT[Number(sr.out.verdict)];
    check(sr.out.proofValid, 'verified against the live precompile');
    check(Number(sr.out.receiptStatus) === 0, 'receiptStatus is 0', `it failed`);
    check(Number(sr.out.gasUsed) === Number(sr.out.gasLimit), 'gasUsed == gasLimit', `${sr.out.gasUsed} / ${sr.out.gasLimit}`);
    check(Number(sr.out.logCount) === 0, 'zero logs, as every revert has');
    check(v === s.expectedVerdict, b(`classified ${v} — SLASHABLE`));
    check(sr.out.from.toLowerCase() === s.operator.toLowerCase(), 'the proven sender is the bonded operator');
  }

  // ── the mainnet gallery ──────────────────────────────────────────────────
  console.log(b(`\n  THE GALLERY — ${M.gallery.items.length} real Ethereum mainnet failures, 2023–2025`));
  console.log(dim('  ─'.repeat(37)));
  console.log(dim('  No bond attaches to these: nobody here holds those keys. That is the identity'));
  console.log(dim('  binding working, not a gap. They run the identical verification path.\n'));

  let slashable = 0;
  for (const item of M.gallery.items) {
    console.log(`  ${b(item.window)}  ${dim('block ' + item.block.toLocaleString('en-US'))}`);
    console.log(`     ${item.sourceTx}`);
    const res = await classify(3, item.sourceTx, probe);
    if (!res) { check(false, 'proof available'); continue; }
    const v = VERDICT[Number(res.out.verdict)];
    check(res.out.proofValid, 'verified against the live precompile', `${res.contRoots} continuity roots`);
    check(Number(res.out.logCount) === 0, 'zero logs');
    check(
      Number(res.out.gasUsed) === item.expectedGasUsed && Number(res.out.gasLimit) === item.expectedGasLimit,
      'gas values decode to the recorded figures',
      `${res.out.gasUsed} / ${res.out.gasLimit}`,
    );
    check(v === item.expectedVerdict, `classified ${v}`, item.note);
    if (v === 'OutOfGas') slashable++;
    console.log('');
  }

  console.log(dim('─'.repeat(78)));
  console.log(`  ${slashable}/${M.gallery.items.length} mainnet failures classified OutOfGas — the slashable class`);
  if (failures === 0) {
    console.log(g(b('\n  ALL CHECKS PASSED\n')));
    console.log('  The gallery proves the classification is right against real failures at real');
    console.log('  scale. Sepolia proves the slash it leads to, end to end. Same code path.\n');
  } else {
    console.log(r(b(`\n  ${failures} CHECK(S) FAILED\n`)));
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error('\nerror:', e.message ?? e); process.exitCode = 1; });
