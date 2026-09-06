/** Deep links. Every hash on the site goes out to an explorer we do not control -- the
 *  contracts are source-verified, so Blockscout decodes ClaimRuled, SlashRefused and
 *  BondSlashed itself and a judge can confirm the argument without trusting this page. */
import { M, type ChainId } from './manifest';

export const txUrl = (chain: ChainId, hash: string) => `${M.chains[chain].explorer}/tx/${hash}`;
export const addrUrl = (chain: ChainId, addr: string) => `${M.chains[chain].explorer}/address/${addr}`;
export const blockUrl = (chain: ChainId, n: number) => `${M.chains[chain].explorer}/block/${n}`;
export const explorerName = (chain: ChainId) => (chain === 'cc3' ? 'Blockscout' : 'Etherscan');
export const short = (h: string, head = 10, tail = 6) =>
  h.length <= head + tail + 1 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;
