import { txUrl, addrUrl, short, explorerName } from '../lib/explorer';
import type { ChainId } from '../lib/manifest';

/** Every hash on the site leaves the site. The contracts are source-verified, so the explorer
 *  decodes ClaimRuled, SlashRefused and BondSlashed itself and a judge can confirm the argument
 *  against something we do not control. */
export function Tx({ chain, hash, label }: { chain: ChainId; hash: string; label?: string }) {
  return (
    <a className="ext mono" href={txUrl(chain, hash)} target="_blank" rel="noreferrer"
       title={`${hash} — open on ${explorerName(chain)}`}>
      {label ?? short(hash)} ↗
    </a>
  );
}
export function Addr({ chain, addr, label }: { chain: ChainId; addr: string; label?: string }) {
  return (
    <a className="ext mono" href={addrUrl(chain, addr)} target="_blank" rel="noreferrer"
       title={`${addr} — open on ${explorerName(chain)}`}>
      {label ?? short(addr, 8, 4)} ↗
    </a>
  );
}
