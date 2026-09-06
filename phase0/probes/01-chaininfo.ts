/** Phase 0 probe 01 — CC3 connectivity, supported chains, attestation genesis floor. */
import { JsonRpcProvider } from 'ethers';
import { chainInfo, blockProver, utils } from '@gluwa/usc-sdk';

const CC3_RPC = 'https://rpc.cc3-testnet.creditcoin.network';

async function main() {
  const rpc = new JsonRpcProvider(CC3_RPC);
  const net = await rpc.getNetwork();
  const head = await rpc.getBlockNumber();
  console.log(`CC3 chainId=${net.chainId} head=${head}`);
  console.log(`BLOCK_PROVER_PRECOMPILE_ADDRESS = ${blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS}`);
  console.log(`CHAIN_INFO_PRECOMPILE_ADDRESS   = ${chainInfo.CHAIN_INFO_PRECOMPILE_ADDRESS}`);
  console.log(`MAX_GAS_CAP (SDK constant)      = ${utils.gas.MAX_GAS_CAP}`);

  // Actual on-chain block gas limit, to test the SDK constant against reality.
  const blk = await rpc.getBlock(head);
  console.log(`CC3 block ${head} gasLimit=${blk?.gasLimit} gasUsed=${blk?.gasUsed}`);

  const provider = new chainInfo.PrecompileChainInfoProvider(rpc);

  console.log('\n--- getSupportedChains() ---');
  const chains = await provider.getSupportedChains();
  for (const c of chains) console.log(JSON.stringify(c, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  console.log('\n--- per-chain genesis / tip ---');
  for (const c of chains) {
    const key = Number((c as any).chainKey ?? (c as any).key);
    try {
      const genesis = await provider.getAttestationGenesisHeight(key);
      const tip = await provider.getLatestAttestedHeightAndHash(key);
      console.log(`chainKey=${key} genesisHeight=${genesis} attestedTip=${tip.height} hash=${tip.hash}`);
    } catch (e: any) {
      console.log(`chainKey=${key} ERROR ${e.shortMessage ?? e.message}`);
    }
  }

  console.log('\n--- getSupportedChainByKey(3) ---');
  const k3 = await provider.getSupportedChainByKey(3);
  console.log(JSON.stringify(k3, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
