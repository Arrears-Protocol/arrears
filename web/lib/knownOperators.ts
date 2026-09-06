'use client';
import { getAddress } from 'ethers';
import { M } from './manifest';
import { registryRead } from './dashRead';

/**
 * Which operator ids this browser knows about.
 *
 * There is no enumerable operator list on chain — `operator` and `claimsAgainst`
 * both need an id you already hold — so the console cannot scan for one. An
 * earlier version resolved only the manifest operator, which meant anyone who
 * registered a second one landed on "no operator for this account" immediately
 * after succeeding. That is the worst possible moment for an empty screen.
 *
 * A local registry is enough and an indexer is not warranted:
 *
 *   · the manifest operator is always known
 *   · the wizard records an id the moment registration confirms
 *   · a source address resolves to an id through `operatorIdOf`, which is pure,
 *     so anyone on a fresh browser can find their own record by typing it
 *
 * Only the third case needs the user to know anything, and it is the only case
 * a local store genuinely cannot cover.
 */
const KEY = 'arrears.knownOperatorIds.v1';

const read = (): string[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
};

export function knownIds(): string[] {
  return Array.from(new Set([M.operator.operatorId, ...read()].map((s) => s.toLowerCase())));
}

export function remember(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = Array.from(new Set([...read(), id.toLowerCase()]));
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private mode: the session still works, it just will not persist */ }
}

/** `operatorIdOf` is pure, so this costs one eth_call and needs no wallet. */
export async function idForSource(sourceAddress: string): Promise<string> {
  const id: string = await registryRead().operatorIdOf(M.operator.chainKey, getAddress(sourceAddress));
  return id;
}
