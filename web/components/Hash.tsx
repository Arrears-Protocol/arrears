import { txUrl, addrUrl, short, explorerName } from '../lib/explorer';
import type { ChainId } from '../lib/manifest';

/** Every hash on the site leaves the site. The contracts are source-verified, so
 *  the explorer decodes ClaimRuled, SlashRefused and BondSlashed itself and a
 *  judge can confirm the argument against something we do not control. */
const base =
  'mono underline decoration-line underline-offset-[3px] transition-colors hover:decoration-fg-3 hover:text-fg';

export function Tx({ chain, hash, label }: { chain: ChainId; hash: string; label?: string }) {
  return (
    <a className={base} href={txUrl(chain, hash)} target="_blank" rel="noreferrer"
       title={`${hash} — open on ${explorerName(chain)}`}>
      {label ?? short(hash)} ↗
    </a>
  );
}
export function Addr({ chain, addr, label }: { chain: ChainId; addr: string; label?: string }) {
  return (
    <a className={base} href={addrUrl(chain, addr)} target="_blank" rel="noreferrer"
       title={`${addr} — open on ${explorerName(chain)}`}>
      {label ?? short(addr, 8, 4)} ↗
    </a>
  );
}
