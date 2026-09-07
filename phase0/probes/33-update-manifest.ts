/** Phase 0 probe 33 — fold the deployment and the rulings into demo/manifest.json,
 *  so the frontend keeps one source. Hashes and addresses only. */
import { readFileSync, writeFileSync } from 'node:fs';
const D = JSON.parse(readFileSync('evidence/31-deploy-protocol.json', 'utf8'));
const R = JSON.parse(readFileSync('evidence/32-rulings.json', 'utf8'));
const S = JSON.parse(readFileSync('evidence/28-sepolia-oog-proven.json', 'utf8'));
const F = JSON.parse(readFileSync('evidence/30-sepolia-refusals.json', 'utf8'));
const MP = '../demo/manifest.json';
const m = JSON.parse(readFileSync(MP, 'utf8'));

m.contracts.arrearsRegistry   = { address: D.registry,   chain: 'cc3', verified: true };
m.contracts.arrearsCreditLine = { address: D.creditLine, chain: 'cc3', verified: true };
m.contracts.arrearsCourt      = { address: D.court,      chain: 'cc3', verified: true };
m.contracts.verdictProbe.verified = true;

m.operator = {
  operatorId: D.operatorId,
  sourceAddress: D.operatorSourceAddress,
  sourceChain: 'sepolia', chainKey: 1,
  controller: D.controller,
  treasury: D.treasury,
  registrationTx: D.transactions.find((t: any) => t.step === 'registry.registerOperator')?.hash,
  bondTx: D.transactions.find((t: any) => t.step.startsWith('registry.postBond'))?.hash,
  coverages: [
    { id: D.coverageA, target: S.target, targetName: 'Sepolia WETH9', selector: '0xd0e30db0', selectorName: 'deposit()',
      fromHeight: D.window.fromHeight, toHeight: D.window.toHeight,
      tx: D.transactions.find((t: any) => t.step.includes('coverage A'))?.hash },
    { id: D.coverageB, target: S.target, targetName: 'Sepolia WETH9', selector: '0xa9059cbb', selectorName: 'transfer(address,uint256)',
      fromHeight: D.window.fromHeight, toHeight: D.window.toHeight,
      tx: D.transactions.find((t: any) => t.step.includes('coverage B'))?.hash },
  ],
  note: 'withdraw(uint256) is deliberately in NO coverage, so an out-of-scope claim has an axis to name.',
};

m.rulings = {
  note: 'Mined rulings from the deployed court. The refusals matter as much as the slash: they are what show the rule is real rather than permissive.',
  relayer: R.relayer, beneficiary: R.beneficiary,
  slash: R.rulings.slash ?? null,
  refusal: R.rulings.refusal ?? null,
  strictRefusal: R.rulings.strictRefusal ?? null,
  outOfScope: R.rulings.outOfScope ?? null,
  // NO finalState. Every figure here is a fact about one mined transaction and
  // cannot drift; the operator's current bond, limit, premium and strike count
  // move with every claim, so they are read from the chain, never frozen.
};

m.slash.sourceFailures = {
  outOfGas:       { tx: S.txHash, block: S.block, gasUsed: S.gasUsed, gasLimit: S.gasLimit, verdict: 'OutOfGas' },
  explicitRevert: { tx: F.explicitRevert.txHash, block: F.explicitRevert.block, gasUsed: F.explicitRevert.gasUsed, gasLimit: F.explicitRevert.gasLimit, verdict: 'ExplicitRevert', selectorName: F.explicitRevert.selectorName },
  outOfScope:     { tx: F.outOfScope.txHash, block: F.outOfScope.block, gasUsed: F.outOfScope.gasUsed, gasLimit: F.outOfScope.gasLimit, selectorName: F.outOfScope.selectorName, note: 'in no coverage scope' },
};

m.attestation = { measuredLagBlocks: 41, measuredLagSecondsApprox: 480, chain: 'sepolia',
  note: 'Broadcast to provable. Makes Arrears a settlement-time mechanism, not an interception one. The demo opens on already-attested artifacts so nothing waits.' };

writeFileSync(MP, JSON.stringify(m, null, 2));
console.log('manifest updated');
console.log('  contracts :', Object.keys(m.contracts).join(', '));
console.log('  rulings   :', Object.entries(m.rulings).filter(([k, v]) => v && !['note','relayer','beneficiary'].includes(k)).map(([k]) => k).join(', '));
