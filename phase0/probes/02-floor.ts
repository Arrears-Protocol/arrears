/** Phase 0 probe 02 — find the ACTUAL provable-history floor for chain key 3 by probing. */
import { JsonRpcProvider } from 'ethers';
import { chainInfo } from '@gluwa/usc-sdk';

const rpc = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');
const p = new chainInfo.PrecompileChainInfoProvider(rpc);
const KEY = 3;

async function bounds(h: number) {
  try {
    const b = await p.getContinuityBounds(KEY, h);
    return { ok: true, ...b };
  } catch (e: any) {
    return { ok: false, err: String(e.message ?? e).slice(0, 150) };
  }
}
async function checkpoint(h: number) {
  try {
    const c = await p.getCheckpointForHeight(KEY, h);
    return { ok: true, ...c };
  } catch (e: any) {
    return { ok: false, err: String(e.message ?? e).slice(0, 120) };
  }
}

async function main() {
  const tip = (await p.getLatestAttestedHeightAndHash(KEY)).height;
  console.log(`attested tip chainKey=${KEY}: ${tip}`);
  console.log(`nominal getAttestationGenesisHeight(${KEY}): ${await p.getAttestationGenesisHeight(KEY)}`);

  const samples = [0, 1, 1_000_000, 10_000_000, 20_000_000, 23_000_000, 25_000_000,
                   25_500_000, 25_700_000, 25_764_741, 25_900_000, tip - 100, tip];
  console.log('\nheight            bounds                                                    checkpoint');
  for (const h of samples) {
    const b: any = await bounds(h);
    const c: any = await checkpoint(h);
    const bs = b.ok
      ? `attested=${b.isAttested} parent=${b.parentHeight} child=${b.childHeight}`
      : `ERR ${b.err}`;
    const cs = c.ok ? `exists=${c.exists} hash=${String(c.hash).slice(0, 18)}` : `ERR ${c.err}`;
    console.log(`${String(h).padStart(10)}  ${bs.padEnd(56)} ${cs}`);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
