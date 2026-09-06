'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CC3, connect as doConnect, currentAccount, ensureCC3, hasWallet } from '../../lib/wallet';
import { short } from '../../lib/explorer';
import { cn } from '../../lib/cn';

/** Wallet state for the dashboard only. Connect and disconnect are available
 *  anywhere, any time. Nothing here gates reading. */
type Ctx = {
  address: string | null; chainId: number | null; onCC3: boolean;
  connect: () => Promise<void>; disconnect: () => void; switchToCC3: () => Promise<void>;
  available: boolean; error: string | null;
};
const WalletCtx = createContext<Ctx>({} as Ctx);
export const useWallet = () => useContext(WalletCtx);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(hasWallet());
    // Only reflects an ALREADY-granted connection. Never prompts on load.
    currentAccount().then((a) => { if (a) { setAddress(a.address); setChainId(a.chainId); } });
    const eth = (window as any).ethereum;
    if (!eth?.on) return;
    const onAcc = (a: string[]) => setAddress(a?.[0] ?? null);
    const onChain = (c: string) => setChainId(parseInt(c, 16));
    eth.on('accountsChanged', onAcc); eth.on('chainChanged', onChain);
    return () => { eth.removeListener?.('accountsChanged', onAcc); eth.removeListener?.('chainChanged', onChain); };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try { const a = await doConnect(); setAddress(a.address); setChainId(a.chainId); }
    catch (e: any) { setError(e.message ?? String(e)); }
  }, []);

  const switchToCC3 = useCallback(async () => {
    setError(null);
    try { await ensureCC3(); const a = await currentAccount(); if (a) setChainId(a.chainId); }
    catch (e: any) { setError(e.message ?? String(e)); }
  }, []);

  // A dapp cannot revoke its own permission; this clears local state, which is
  // what "disconnect" means everywhere. Said plainly in the UI rather than implied.
  const disconnect = useCallback(() => { setAddress(null); setError(null); }, []);

  return (
    <WalletCtx.Provider value={{
      address, chainId, onCC3: chainId === CC3.chainIdDec,
      connect, disconnect, switchToCC3, available, error,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function ConnectButton({ className }: { className?: string }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (!w.address) {
    return (
      <button onClick={w.connect}
        className={cn('mono rounded-inner border border-line px-3 py-1.5 text-[11.5px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg', className)}>
        {w.available ? 'connect' : 'no wallet'}
      </button>
    );
  }
  return (
    <div className={cn('relative', className)}>
      <button onClick={() => setOpen(!open)}
        className="mono flex items-center gap-2 rounded-inner border border-line px-3 py-1.5 text-[11.5px] text-fg transition-colors hover:border-fg-3">
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: w.onCC3 ? 'var(--pass)' : 'var(--miss)' }} />
        {short(w.address, 6, 4)}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[248px] rounded-inner border border-line bg-bg-raised p-3 shadow-lg">
          <div className="mono text-[10px] uppercase tracking-[0.1em] text-fg-3">connected</div>
          <div className="mono mt-1 break-all text-[11.5px] text-fg">{w.address}</div>
          <div className="mono mt-2 text-[11px]" style={{ color: w.onCC3 ? 'var(--pass)' : 'var(--miss)' }}>
            {w.onCC3 ? `on ${CC3.name}` : `wrong network · chain ${w.chainId}`}
          </div>
          {!w.onCC3 && (
            <button onClick={w.switchToCC3}
              className="mono mt-2.5 w-full rounded-inner border border-line px-2 py-1.5 text-[11px] hover:border-fg-3">
              switch to Creditcoin CC3
            </button>
          )}
          <button onClick={() => { w.disconnect(); setOpen(false); }}
            className="mono mt-2 w-full rounded-inner border border-line px-2 py-1.5 text-[11px] text-fg-2 hover:border-fg-3">
            disconnect
          </button>
          <p className="mt-2 text-[10.5px] leading-snug text-fg-3">
            Disconnect clears this site&apos;s state. Revoking the permission itself is done in
            your wallet.
          </p>
        </div>
      )}
    </div>
  );
}

export function NeedsWallet({ children, what }: { children: React.ReactNode; what: string }) {
  const w = useWallet();
  if (!w.address) {
    return (
      <div className="rounded-card border border-line bg-bg-raised p-6">
        <div className="mono text-[10px] uppercase tracking-[0.12em] text-fg-3">wallet required</div>
        <p className="mt-2 max-w-[60ch] text-[14.5px] leading-relaxed text-fg-2">
          {what} needs a wallet, because it sends a transaction. <strong className="text-fg">Reading
          needs nothing</strong> — every record on this site, and the whole of the landing page,
          is readable with nothing installed.
        </p>
        <div className="mt-4"><ConnectButton /></div>
        {w.error && <p className="mono mt-3 text-[11.5px]" style={{ color: 'var(--miss)' }}>{w.error}</p>}
      </div>
    );
  }
  if (!w.onCC3) {
    return (
      <div className="rounded-card border border-line bg-bg-raised p-6">
        <div className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--miss)' }}>wrong network</div>
        <p className="mt-2 text-[14.5px] text-fg-2">This writes to Creditcoin CC3 (chain {CC3.chainIdDec}).</p>
        <button onClick={w.switchToCC3}
          className="mono mt-4 rounded-inner border border-line px-3 py-2 text-[12px] hover:border-fg-3">
          switch network
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
