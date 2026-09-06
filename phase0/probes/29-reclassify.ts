/** Phase 0 probe 29 — deploy VerdictProbe and re-run all seven mainnet failures through the
 *  DEPLOYED classifier, comparing against what the Phase 0 transcript claimed.
 *
 *  Phase 0 classified these from mainnet RPC receipts, before Verdict existed and before the
 *  slashable class was narrowed. This re-runs them through the on-chain path the product
 *  actually uses: precompile verify -> EvmV1Decoder -> ArrearsVerdict.classify. Any divergence
 *  is REPORTED, never corrected in place. */
import { JsonRpcProvider, Wallet, ContractFactory, Contract, formatEther } from 'ethers';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os'; import { join } from 'node:path';
import { proofProvider } from '@gluwa/usc-sdk';

const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const DECODER = '0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f';
const ART = '../contracts/out';
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const w = new Wallet(kf.accounts.deployer.privateKey, CC3);
const VERDICT = ['None', 'Succeeded', 'ExplicitRevert', 'OutOfGas'];

/** What the Phase 0 transcript asserted about each of the seven. */
const PHASE0: Array<{window: string; hash: string; note: string; claimed: string; claimedGasUsed: number; claimedGasLimit: number}> = [
  { window: 'USDC depeg (SVB) 2023-03-11', hash: '0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096', note: 'Uniswap V2 Router swapExactTokensForETHSupportingFee', claimed: 'OutOfGas', claimedGasUsed: 324239, claimedGasLimit: 324239 },
  { window: 'USDC depeg (SVB) 2023-03-11', hash: '0x1dd76820f55cc790a57ed33eee30ed25d120f6f0820a89c1f55a6c2dc7e71c22', note: 'OOG 77,600', claimed: 'OutOfGas', claimedGasUsed: 77600, claimedGasLimit: 77600 },
  { window: 'Yen carry unwind 2024-08-05', hash: '0x252a53c5d5fa0706ba15624c62db62300708eb9dbe14454af7a73f8fed6625e4', note: 'OOG 134,138', claimed: 'OutOfGas', claimedGasUsed: 134138, claimedGasLimit: 134138 },
  { window: 'Yen carry unwind 2024-08-05', hash: '0xbf4a64126832f98707b723de0bc68b5883144313d5e8f2cb627847193aa206d0', note: 'USDT transfer OOG 76,808', claimed: 'OutOfGas', claimedGasUsed: 76808, claimedGasLimit: 76808 },
  { window: 'Feb 2025 selloff 2025-02-03', hash: '0x3198a097f62d37dc2463b87adf87419621a8bf45e014491c0f9911aa09224fcc', note: 'OOG 134,482', claimed: 'OutOfGas', claimedGasUsed: 134482, claimedGasLimit: 134482 },
  { window: 'Oct 2025 cascade 2025-10-10', hash: '0x27cb58551d34f7b1a48fabdbfc8ca078a2e7aaf0bed52b425a980cd11d4a967c', note: 'USDT transfer OOG 120,000', claimed: 'OutOfGas', claimedGasUsed: 120000, claimedGasLimit: 120000 },
  { window: 'Oct 2025 cascade 2025-10-10', hash: '0xee76fbbb8fe207a1af967a751dd5dd2c0b3fb6ae3f061ec108fc13d12df3c756', note: 'USDT transfer OOG 80,000', claimed: 'OutOfGas', claimedGasUsed: 80000, claimedGasLimit: 80000 },
];

function load(name: string) {
  const a = JSON.parse(readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8'));
  const bc = a.bytecode.object.replace(/__\$[0-9a-f]{34}\$__/g, DECODER.slice(2).toLowerCase());
  if (/__\$/.test(bc)) throw new Error(`${name}: unlinked`);
  return { abi: a.abi, bytecode: bc };
}

async function main() {
  console.log(`deployer ${w.address}  ${formatEther(await CC3.getBalance(w.address))} tCTC\n`);
  const { abi, bytecode } = load('VerdictProbe');
  const f = new ContractFactory(abi, bytecode, w);
  const c = await f.deploy();
  const rc = await c.deploymentTransaction()!.wait();
  const probeAddr = await c.getAddress();
  console.log(`VerdictProbe deployed ${probeAddr}`);
  console.log(`  gasUsed ${rc!.gasUsed} · tx ${rc!.hash}\n`);

  const probe = new Contract(probeAddr, abi, CC3);
  const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 120000);

  const rows: any[] = [];
  const discrepancies: any[] = [];

  for (const p of PHASE0) {
    const r = await b.getProof(p.hash);
    if (!r.success) { console.log(`${p.hash}  PROOF UNAVAILABLE`); discrepancies.push({ hash: p.hash, kind: 'proof-unavailable' }); continue; }
    const d: any = r.data;
    const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
    const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];

    const out = await probe.read(3, d.headerNumber, d.txBytes, mp, cp);
    const got = VERDICT[Number(out.verdict)];
    const agree = got === p.claimed
      && Number(out.gasUsed) === p.claimedGasUsed
      && Number(out.gasLimit) === p.claimedGasLimit;

    const row = {
      window: p.window, sourceTx: p.hash, note: p.note,
      height: Number(d.headerNumber), txIndex: Number(out.txIndex),
      contRoots: d.continuityProof.roots.length,
      proofValid: out.proofValid,
      verdict: got, phase0Claimed: p.claimed,
      receiptStatus: Number(out.receiptStatus),
      gasUsed: Number(out.gasUsed), gasLimit: Number(out.gasLimit),
      phase0GasUsed: p.claimedGasUsed, phase0GasLimit: p.claimedGasLimit,
      logCount: Number(out.logCount),
      from: out.from, target: out.target, selector: out.selector,
      slashable: got === 'OutOfGas',
      agreesWithPhase0: agree,
    };
    rows.push(row);
    if (!agree) discrepancies.push(row);

    console.log(`${p.window}`);
    console.log(`  ${p.hash}`);
    console.log(`  proofValid=${out.proofValid}  txIndex=${out.txIndex}  logs=${out.logCount}`);
    console.log(`  receiptStatus=${out.receiptStatus}  gasUsed=${out.gasUsed}  gasLimit=${out.gasLimit}`);
    console.log(`  DEPLOYED CLASSIFIER -> ${got}${got === 'OutOfGas' ? '  (slashable)' : '  (NOT slashable)'}`);
    console.log(`  phase 0 transcript  -> ${p.claimed}   ${agree ? 'AGREES' : '*** DISCREPANCY ***'}\n`);
  }

  writeFileSync('evidence/29-reclassify.json', JSON.stringify({ probe: probeAddr, deployTx: rc!.hash, rows, discrepancies }, null, 2));

  console.log('='.repeat(72));
  console.log(`re-classified ${rows.length} of ${PHASE0.length} through the deployed classifier`);
  console.log(`all proofs valid:      ${rows.every(r => r.proofValid)}`);
  console.log(`all zero logs:         ${rows.every(r => r.logCount === 0)}`);
  console.log(`classified OutOfGas:   ${rows.filter(r => r.slashable).length}/${rows.length}`);
  if (discrepancies.length === 0) {
    console.log(`\nNO DISCREPANCIES. Every Phase 0 classification survives the narrowed rule.`);
  } else {
    console.log(`\n*** ${discrepancies.length} DISCREPANCY(IES) — reported, not corrected ***`);
    for (const d of discrepancies) console.log('  ' + JSON.stringify(d));
    process.exitCode = 1;
  }
}
main().catch(e => { console.error('FATAL', e.message ?? e); process.exit(1); });
