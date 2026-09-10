/**
 * Arrears — exploit demo verifier.
 *
 * Reads both halves of the demo straight off the live chains and decodes what actually happened.
 * No key, no funding, no .env, no build step. Every hash below is a real mined transaction; this
 * script re-reads them each time it runs rather than trusting anything committed here.
 *
 *   npm install && npm run verify
 *
 * Every lookup goes through ../lib/chain-read.mts: a public RPC that returns null for a
 * transaction that exists falls through to Blockscout, and an endpoint that cannot be reached is
 * reported as a failure to look — never as evidence that something is missing. This is the one
 * script a judge runs from a clean clone, so it must not fail on one node's gap.
 * FORCE_SECOND_ROUTE=1 skips the RPC entirely.
 */
import { Interface, id, formatUnits, getAddress } from 'ethers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { receipt, code, LookupFailed, type Chain, type Receipt } from '../lib/chain-read.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const A = { cc3: M.chains.cc3, sepolia: M.chains.sepolia, halfOne: M.exploits.halfOne, halfTwo: M.exploits.halfTwo };

const SETTLEMENT = new Interface([
  'event SettlementAccepted(bytes32 indexed key, uint64 indexed chainKey, uint64 height, address payer, address target, uint256 value, bytes4 selector, uint64 gasUsed)',
]);
const TRANSFERS = new Interface([
  'event TransferAccepted(uint64 indexed chainKey, uint64 indexed height, address indexed emitter, address from, address to, uint256 amount, bool emitterWasExpected)',
]);
const PRECOMPILE = '0x0000000000000000000000000000000000000fd2';
const TX_VERIFIED = id('TransactionVerified(uint64,uint64,uint64)');

const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  if (!ok) failures++;
  console.log(`   ${ok ? g('PASS') : r('FAIL')}  ${label}${detail ? dim('  ' + detail) : ''}`);
}
const rule = () => console.log(dim('─'.repeat(78)));

/** A receipt, or a FAIL line saying exactly why there is none. Never a TypeError. */
async function read(chain: Chain, hash: string, what: string): Promise<Receipt | null> {
  try {
    const rc = await receipt(chain, hash);
    if (rc && rc.via !== 'rpc') console.log(dim(`     (${hash.slice(0, 10)}… ${rc.note})`));
    if (!rc) check(false, `${what} exists`, `the RPC and Blockscout both answered, and neither has ${hash}`);
    return rc;
  } catch (e: any) {
    check(false, `${what} could be looked up`, e instanceof LookupFailed ? e.message : String(e?.message ?? e));
    return null;
  }
}

async function halfOne() {
  const h = A.halfOne;
  console.log(b('\nHALF ONE — a proven FAILURE accepted as a genuine settlement'));
  rule();
  console.log(`   ${h.title}\n`);

  // 1. the source transaction really did revert on Ethereum mainnet
  const src = await read('mainnet', h.sourceTx, 'the mainnet source transaction');
  console.log(`   source (Ethereum mainnet)  ${h.sourceTx}`);
  if (src) {
    check(src.status === '0x0', 'the source transaction REVERTED on mainnet', `receiptStatus=${src.status}`);
    check(src.logs.length === 0, 'it carries zero logs (a revert rolls back the journal)', `logs=${src.logs.length}`);
    check(parseInt(src.blockNumber, 16) === h.sourceBlock, `mainnet block ${h.sourceBlock}`);
  }

  // 2. the CC3 ruling accepted it anyway
  const rc = await read('cc3', h.acceptanceTx, 'the CC3 ruling');
  console.log(`\n   ruling (Creditcoin CC3)    ${h.acceptanceTx}`);
  if (!rc) return;
  check(rc.status === '0x1', 'the naive ASC transaction SUCCEEDED', `status=${rc.status}`);
  check(!!rc.to && getAddress(rc.to) === getAddress(h.contract), `sent to the naive ASC ${h.contract}`);

  const proved = rc.logs.filter((l) => l.address.toLowerCase() === PRECOMPILE && l.topics[0] === TX_VERIFIED);
  check(proved.length >= 1, 'the block-prover precompile emitted TransactionVerified', `${proved.length} event(s)`);

  let accepted: any = null;
  for (const l of rc.logs) { try { const p = SETTLEMENT.parseLog(l); if (p?.name === 'SettlementAccepted') accepted = p; } catch {} }
  check(!!accepted, 'the ASC emitted SettlementAccepted for a transaction that FAILED');
  if (accepted) {
    console.log(`\n   ${b('what the contract recorded:')}`);
    console.log(`     payer     ${accepted.args.payer}`);
    console.log(`     target    ${accepted.args.target}  ${dim('(1inch v6 AggregationRouter)')}`);
    console.log(`     selector  ${accepted.args.selector}`);
    console.log(`     gasUsed   ${accepted.args.gasUsed}  ${dim('— decoded from the same bytes that carry receiptStatus 0')}`);
    if (src) check(accepted.args.gasUsed.toString() === String(parseInt(src.gasUsed, 16)),
      'the recorded gasUsed matches mainnet exactly', `${accepted.args.gasUsed}`);
  }
  console.log(`\n   ${dim('The contract had receiptStatus in hand and never read it.')}`);
  console.log(`   ${dim('Its strict twin refuses the identical proof with ' + h.strictError)}`);
  console.log(`\n   ${A.cc3.explorer}/tx/${h.acceptanceTx}`);
}

async function halfTwo() {
  const h = A.halfTwo;
  console.log(b('\nHALF TWO — a forged event credited to a token it never touched'));
  rule();
  console.log(`   ${h.title}\n`);

  // 1. the impostor on Sepolia is not a token
  console.log(`   impostor (Sepolia)         ${h.impostor}`);
  try {
    const c = await code('sepolia', h.impostor);
    if (c.via !== 'rpc') console.log(dim(`     (${h.impostor.slice(0, 10)}… ${c.note})`));
    check(c.bytes > 0, 'the impostor contract exists on Sepolia', `${c.bytes} bytes`);
    check(c.bytes > 0 && c.bytes < 400, 'it is far too small to be a real ERC-20', `${c.bytes} bytes`);
  } catch (e: any) {
    check(false, 'the impostor contract could be looked up', e.message);
  }

  // 2. it emitted a real Transfer log
  const frc = await read('sepolia', h.forgeTx, 'the Sepolia forge transaction');
  console.log(`\n   forged event (Sepolia)     ${h.forgeTx}`);
  if (frc) {
    const log = frc.logs[0];
    check(frc.status === '0x1', 'the forge transaction succeeded on Sepolia');
    check(!!log && log.topics[0] === id('Transfer(address,address,uint256)'), 'topic[0] is the standard ERC-20 Transfer signature');
    check(!!log && getAddress(log.address) === getAddress(h.impostor), 'but it was emitted by the IMPOSTOR, not a token');
    console.log(`     claims  ${formatUnits(h.forgedAmount, 6)} USDC from ${h.forgedFrom} ${dim("(Circle's treasury)")}`);
  }

  // 3. CC3 accepted it against the real token
  const rc = await read('cc3', h.acceptanceTx, 'the CC3 ruling');
  console.log(`\n   ruling (Creditcoin CC3)    ${h.acceptanceTx}`);
  if (!rc) return;
  check(rc.status === '0x1', 'the naive ASC transaction SUCCEEDED');
  const proved = rc.logs.filter((l) => l.address.toLowerCase() === PRECOMPILE && l.topics[0] === TX_VERIFIED);
  check(proved.length >= 1, 'the precompile proved the Sepolia transaction', `${proved.length} event(s)`);

  let acc: any = null;
  for (const l of rc.logs) { try { const p = TRANSFERS.parseLog(l); if (p?.name === 'TransferAccepted') acc = p; } catch {} }
  check(!!acc, 'the ASC emitted TransferAccepted');
  if (acc) {
    console.log(`\n   ${b('what the contract recorded:')}`);
    console.log(`     emitter             ${acc.args.emitter}  ${r('← the impostor')}`);
    console.log(`     it believed it watched ${h.expectedToken}  ${dim('(real Sepolia USDC)')}`);
    console.log(`     from                ${acc.args.from}`);
    console.log(`     amount              ${formatUnits(acc.args.amount, 6)} USDC`);
    console.log(`     emitterWasExpected  ${r(String(acc.args.emitterWasExpected))}`);
    check(acc.args.emitterWasExpected === false,
      b('it emitted emitterWasExpected:false IN THE SAME EVENT IT ACCEPTED'));
    check(getAddress(acc.args.emitter) !== getAddress(h.expectedToken),
      'the emitter is provably not the token it trusts');
  }
  console.log(`\n   ${dim('It had the mismatch in hand and acted anyway: nothing in its logic consulted it.')}`);
  console.log(`   ${dim('Its strict twin refuses the identical proof with ' + h.strictError)}`);
  console.log(`\n   ${A.cc3.explorer}/tx/${h.acceptanceTx}`);
  console.log(`   ${A.sepolia.explorer}/address/${h.impostor}`);
}

async function main() {
  const which = process.argv[2];
  console.log(b('\nArrears — exploit demo, verified live off chain'));
  console.log(dim('Nothing here is a fixture. Every value is re-read from CC3, Sepolia and Ethereum mainnet.'));
  if (process.env.FORCE_SECOND_ROUTE) console.log(dim('FORCE_SECOND_ROUTE: every lookup skips the RPC and reads Blockscout.'));
  if (which !== 'two') await halfOne();
  if (which !== 'one') await halfTwo();
  rule();
  if (failures === 0) {
    console.log(g(b('\n  ALL CHECKS PASSED — both halves confirmed on chain.\n')));
    console.log('  Neither is a flaw in Attestcoin. Both proofs are sound: those transactions');
    console.log('  really happened and those logs really were emitted. What fails is the');
    console.log('  inference each consuming contract drew from a correct proof.\n');
  } else {
    console.log(r(b(`\n  ${failures} CHECK(S) FAILED\n`)));
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error('\nerror:', e.message ?? e); process.exitCode = 1; });
