/**
 * One way to ask a chain whether something exists.
 *
 * Every script in this repository that looks up a historical transaction, or asks
 * whether an address holds code, goes through here. A new one should too, rather
 * than reaching for a provider directly — that is the point of it being one module.
 *
 * Two rules, structural rather than remembered:
 *
 *   1. ABSENCE IS NOT ONE NODE'S NULL. A public RPC can return `null` for a
 *      transaction that plainly exists — public Sepolia did, for three different
 *      transactions this repository cites, on 10 Sep 2026 — and `null` is exactly what
 *      a missing transaction looks like. So a miss on the RPC falls through to the
 *      chain's Blockscout API. `null` comes back from here only when every route
 *      answered and none of them had it.
 *
 *   2. FAILING TO LOOK IS NOT ABSENCE. If no route found it and any route failed to
 *      answer — refused connection, timeout, rate limit, HTML where JSON belongs —
 *      this throws LookupFailed. A caller never gets to read "could not ask" as
 *      "is not there".
 *
 * Every result says which route answered and, when it was not the RPC, why not.
 *
 *   FORCE_SECOND_ROUTE=1           skip the RPC entirely, to prove the fallback stands alone
 *   CC3_RPC / SEPOLIA_RPC / ETH_RPC override the primary endpoints
 *
 * Dependency-free on purpose. It is imported from demo/, deck/ and anywhere else, and
 * must resolve from a fresh clone whichever package was installed. It also means a dead
 * endpoint fails in one request instead of a client library retrying it forever.
 *
 * docs/principles.md rule 6.
 */

export type Chain = 'cc3' | 'sepolia' | 'mainnet';
export type Via = 'rpc' | 'blockscout';

const RPC: Record<Chain, string> = {
  cc3: process.env.CC3_RPC ?? 'https://rpc.cc3-testnet.creditcoin.network',
  sepolia: process.env.SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  mainnet: process.env.ETH_RPC ?? 'https://ethereum-rpc.publicnode.com',
};
export const BLOCKSCOUT: Record<Chain, string> = {
  cc3: 'https://creditcoin-testnet.blockscout.com',
  sepolia: 'https://eth-sepolia.blockscout.com',
  mainnet: 'https://eth.blockscout.com',
};
/** The primary endpoint for a chain, honouring the env overrides. For calls that must execute. */
export const rpcUrl = (c: Chain) => RPC[c];

const FORCE = !!process.env.FORCE_SECOND_ROUTE;
const RPC_TIMEOUT_MS = 20_000;
// CC3's Blockscout answers a transaction in a second or two but its logs endpoint routinely
// takes 6–23s (measured 10 Sep 2026). A 20s limit made a working fallback report failure.
const EXPLORER_TIMEOUT_MS = 60_000;
/** One more attempt for anything that is not an answer — a timeout, a 429, a 5xx, HTML. Never for a 404. */
const EXPLORER_ATTEMPTS = 2;

export class LookupFailed extends Error {
  constructor(what: string, readonly failures: string[]) {
    super(`could not establish whether ${what} exists (${failures.join('; ')}) — a failure to look, not evidence of absence`);
    this.name = 'LookupFailed';
  }
}

export interface Log { address: string; topics: string[]; data: string }
/** The eth_getTransactionReceipt shape, whichever route produced it, plus gasLimit and provenance. */
export interface Receipt {
  transactionHash: string;
  from: string | null;
  to: string | null;
  contractAddress: string | null;
  status: '0x0' | '0x1';
  blockNumber: string;
  gasUsed: string;
  gasLimit: string | null;
  logs: Log[];
  via: Via;
  /** When via is not the RPC: why the RPC did not answer. */
  note: string;
}
export interface Code { code: string; bytes: number; via: Via | 'every route'; note: string }

function why(route: string, e: any): string {
  const detail = e?.name === 'TimeoutError' ? 'timed out' : (e?.cause?.code ?? e?.message ?? String(e));
  return `${route}: ${detail}`;
}
const hex = (n: bigint | number | string) => '0x' + BigInt(n).toString(16);

async function rpc(chain: Chain, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC[chain], {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j: any = await res.json();
  if (j.error) throw new Error(j.error.message ?? JSON.stringify(j.error));
  return j.result;
}

/** A Blockscout v2 read: null for a genuine 404, a throw for anything that is not an answer. */
async function blockscout(chain: Chain, path: string): Promise<any | null> {
  let last: unknown;
  for (let attempt = 1; attempt <= EXPLORER_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BLOCKSCOUT[chain]}/api/v2${path}`, { signal: AbortSignal.timeout(EXPLORER_TIMEOUT_MS) });
      if (res.status === 404) return null;                       // an answer: it is not there
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json')) throw new Error(`non-JSON response (${type || 'no content-type'})`);
      return await res.json();
    } catch (e) {
      last = e;
      if (attempt < EXPLORER_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}

const host = (c: Chain) => new URL(BLOCKSCOUT[c]).host;

/**
 * A mined transaction's receipt. `null` only when the RPC and Blockscout both answered
 * and neither has it; throws LookupFailed when it cannot be established either way.
 */
export async function receipt(chain: Chain, hash: string): Promise<Receipt | null> {
  const failures: string[] = [];
  let note = 'RPC skipped (FORCE_SECOND_ROUTE)';

  if (!FORCE) {
    try {
      const r = await rpc(chain, 'eth_getTransactionReceipt', [hash]);
      if (r) {
        const t = await rpc(chain, 'eth_getTransactionByHash', [hash]).catch(() => null);
        return {
          transactionHash: r.transactionHash, from: r.from ?? null, to: r.to ?? null,
          contractAddress: r.contractAddress ?? null, status: r.status, blockNumber: r.blockNumber,
          gasUsed: r.gasUsed, gasLimit: t?.gas ?? null,
          logs: (r.logs ?? []).map((l: any) => ({ address: l.address, topics: l.topics, data: l.data })),
          via: 'rpc', note: '',
        };
      }
      note = 'the RPC returned null';
    } catch (e) {
      failures.push(why(`${chain} RPC`, e));
      note = `the RPC failed (${failures[0]})`;
    }
  }

  try {
    const t = await blockscout(chain, `/transactions/${hash}`);
    if (t?.hash) {
      if (t.status == null) throw new Error('transaction not yet final on Blockscout');
      const logs: Array<Log & { index: number }> = [];
      let query = '';
      for (let page = 0; page < 50; page++) {
        const l = await blockscout(chain, `/transactions/${hash}/logs${query}`);
        for (const x of l?.items ?? []) {
          logs.push({ index: Number(x.index ?? logs.length), address: x.address.hash,
                      topics: (x.topics ?? []).filter((z: unknown) => z != null), data: x.data });
        }
        if (!l?.next_page_params) break;
        query = '?' + new URLSearchParams(Object.entries(l.next_page_params).map(([k, v]) => [k, String(v)]));
      }
      logs.sort((a, b) => a.index - b.index);
      return {
        transactionHash: t.hash, from: t.from?.hash ?? null, to: t.to?.hash ?? null,
        contractAddress: t.created_contract?.hash ?? null,
        status: t.status === 'ok' ? '0x1' : '0x0',
        blockNumber: hex(t.block_number ?? t.block), gasUsed: hex(t.gas_used),
        gasLimit: t.gas_limit != null ? hex(t.gas_limit) : null,
        logs: logs.map(({ index, ...l }) => l),
        via: 'blockscout', note: `${note}; read from ${host(chain)}`,
      };
    }
  } catch (e) {
    failures.push(why(host(chain), e));
  }

  if (failures.length) throw new LookupFailed(`${hash} on ${chain}`, failures);
  return null;
}

/**
 * The code at an address. An empty answer from the RPC is a miss, not a verdict: it
 * falls through to Blockscout. Empty comes back only when every route agrees.
 */
export async function code(chain: Chain, address: string): Promise<Code> {
  const failures: string[] = [];
  let note = 'RPC skipped (FORCE_SECOND_ROUTE)';

  if (!FORCE) {
    try {
      const c = await rpc(chain, 'eth_getCode', [address, 'latest']);
      if (c && c !== '0x') return { code: c, bytes: (c.length - 2) / 2, via: 'rpc', note: '' };
      note = 'the RPC returned no code';
    } catch (e) {
      failures.push(why(`${chain} RPC`, e));
      note = `the RPC failed (${failures[0]})`;
    }
  }

  try {
    const s = await blockscout(chain, `/smart-contracts/${address}`);
    const c: string | undefined = s?.deployed_bytecode;
    if (c && c !== '0x') return { code: c, bytes: (c.length - 2) / 2, via: 'blockscout', note: `${note}; read from ${host(chain)}` };
    const a = await blockscout(chain, `/addresses/${address}`);
    if (a?.is_contract) throw new Error('Blockscout lists a contract here but returned no bytecode');
  } catch (e) {
    failures.push(why(host(chain), e));
  }

  if (failures.length) throw new LookupFailed(`code at ${address} on ${chain}`, failures);
  return { code: '0x', bytes: 0, via: 'every route', note: 'no route found code' };
}
