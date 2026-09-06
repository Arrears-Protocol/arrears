/** Phase 0 probe 15 — resolve 101,002 vs 1,092,100. What does each number measure? */
import { JsonRpcProvider } from 'ethers';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const RULING = '0xd136dea0524b7e0e9eba54bf9724eec78597c2598047a96849af727f4d243810';

function intrinsicCalldataGas(hex: string) {
  const b = Buffer.from(hex.slice(2), 'hex');
  let zero = 0, nonzero = 0;
  for (const x of b) (x === 0 ? zero++ : nonzero++);
  return { bytes: b.length, zero, nonzero, gas: zero * 4 + nonzero * 16 };
}

async function main() {
  const tx = await CC3.send('eth_getTransactionByHash', [RULING]);
  const rc = await CC3.send('eth_getTransactionReceipt', [RULING]);
  if (!tx || !rc) { console.log('ruling tx not found on CC3'); return; }

  const cd = intrinsicCalldataGas(tx.input);
  const gasUsed = parseInt(rc.gasUsed, 16);
  console.log('=== the MINED ruling transaction on CC3 ===');
  console.log(`  hash        ${RULING}`);
  console.log(`  to          ${rc.to}   (index41's own court contract, NOT the precompile)`);
  console.log(`  status      ${rc.status}   block ${parseInt(rc.blockNumber,16)}`);
  console.log(`  gasUsed     ${gasUsed.toLocaleString()}`);
  console.log(`  gasLimit    ${parseInt(tx.gas,16).toLocaleString()}`);
  console.log(`  calldata    ${cd.bytes} bytes (${cd.nonzero} nonzero, ${cd.zero} zero)`);
  console.log(`  logs        ${rc.logs.length}`);
  const fromPrecompile = rc.logs.filter((l:any)=>l.address.toLowerCase()==='0x0000000000000000000000000000000000000fd2');
  console.log(`  logs emitted BY the precompile: ${fromPrecompile.length}`);
  for (const l of rc.logs) console.log(`    log from ${l.address}  topic0=${l.topics[0]?.slice(0,18)}...`);

  console.log('\n=== decomposition of the 1,092,100 ===');
  console.log(`  21,000                     intrinsic transaction`);
  console.log(`  ${String(cd.gas).padStart(10)}                 calldata (${cd.nonzero}x16 + ${cd.zero}x4)`);
  const floor = 21000 + cd.gas;
  console.log(`  ${String(floor).padStart(10)}                 = unavoidable floor before ANY execution`);
  console.log(`  ${String(gasUsed - floor).padStart(10)}                 = all execution: 3x verifyAndEmit + 3x calculateTxIndex`);
  console.log(`                                 + storage writes + 5 events + the bond payment`);
  console.log(`  ${String(gasUsed).padStart(10)}                 total`);
  console.log(`\n  naive "per verifyAndEmit" = ${gasUsed}/3 = ${Math.round(gasUsed/3).toLocaleString()}  <-- the 364k figure`);
  console.log(`  but that attributes 100% of a contract's storage, events and payout to the precompile.`);

  console.log('\n=== what 101,002 measured ===');
  console.log('  a DIRECT EOA -> precompile call, ONE leg, index41\'s own front-leg proof.');
  console.log('  6,340 bytes calldata. It includes the 21,000 intrinsic that a contract-internal');
  console.log('  call does NOT pay, and excludes contract storage/events entirely.');
  console.log('  So it is not comparable to 1,092,100 either -- both are composites.');
}
main().catch(e => console.error('FATAL', e.message));
