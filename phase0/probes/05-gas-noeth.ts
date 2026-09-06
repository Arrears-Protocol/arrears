import { JsonRpcProvider, Contract, Interface } from 'ethers';
import { proofProvider, blockProver } from '@gluwa/usc-sdk';
const CC3 = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const FROM = '0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030'; // unfunded
const TX = '0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7';
const iface = new Interface([
  'function verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[])) returns (bool)',
  'function verifyAndEmit(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[])) returns (bool)',
]);
async function main() {
  const bal = await CC3.getBalance(FROM);
  console.log(`deployer ${FROM} balance=${bal} wei`);
  const b = new proofProvider.service.ProofBuilder(3, 'https://prover.cc3-testnet.creditcoin.network', 60000);
  const d: any = (await b.getProof(TX)).data;
  const mp = [d.merkleProof.root, d.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft])];
  const cp = [d.continuityProof.lowerEndpointDigest, d.continuityProof.roots];
  const data = iface.encodeFunctionData(
    'verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))',
    [3, d.headerNumber, d.txBytes, mp, cp]);
  console.log(`calldata ${(data.length - 2) / 2} bytes`);
  try {
    const g = await CC3.estimateGas({ to: blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS, data, from: FROM });
    console.log(`estimateGas(single verifyAndEmit) = ${g}`);
  } catch (e: any) { console.log(`estimateGas FAILED: ${e.shortMessage ?? e.message}`); }
}
main().catch(e => console.error('FATAL', e.message));
