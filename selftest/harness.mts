/**
 * A real browser driving the real UI with a real wallet.
 *
 * window.ethereum is injected before any page script and proxies every request
 * to Node over a Playwright binding, where the keys live — so the page never
 * sees a private key, and every signature and transaction is genuine.
 *
 * It starts on Ethereum mainnet, NOT Creditcoin, because a wallet that has never
 * seen CC3 is the normal case for a first-time user and the switch path is the
 * one most likely to be broken.
 */
import { chromium, type Page, type BrowserContext } from 'playwright';
import { JsonRpcProvider, Wallet, getAddress, getBytes } from 'ethers';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const M = JSON.parse(readFileSync('../demo/manifest.json', 'utf8'));
const kf = JSON.parse(readFileSync(join(homedir(), '.config', 'creditcoin', 'arrears-testnet.json'), 'utf8'));
const CC3_HEX = '0x' + M.chains.cc3.chainId.toString(16);
const rpc = new JsonRpcProvider(M.chains.cc3.rpc, M.chains.cc3.chainId, { staticNetwork: true });

export type Acct = 'controller' | 'source';
const KEYS: Record<Acct, Wallet> = {
  controller: new Wallet(kf.accounts.deployer.privateKey, rpc),
  source: new Wallet(kf.accounts.selftestSource.privateKey, rpc),
};

export interface Harness {
  ctx: BrowserContext; page: Page;
  state: { active: Acct; chainId: string; addChainCalls: string[]; switchCalls: string[]; signCalls: number; sendCalls: number; approved: boolean };
  setAccount(a: Acct): Promise<void>;
  close(): Promise<void>;
}

export async function harness(opts: { startChain?: string; preApproved?: boolean } = {}): Promise<Harness> {
  const state = {
    active: 'controller' as Acct,
    chainId: opts.startChain ?? '0x1',        // Ethereum mainnet: a wallet that has never seen CC3
    addChainCalls: [] as string[], switchCalls: [] as string[], signCalls: 0, sendCalls: 0,
    // A real wallet returns [] from eth_accounts until the user has approved the
    // site. Auto-connecting would skip the exact flow this test exists to walk.
    approved: opts.preApproved ?? false,
  };
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();

  await page.exposeFunction('__walletRpc', async (method: string, params: any[] = []) => {
    const w = KEYS[state.active];
    switch (method) {
      case 'eth_requestAccounts': state.approved = true; return [getAddress(w.address)];
      case 'eth_accounts': return state.approved ? [getAddress(w.address)] : [];
      case 'eth_chainId': return state.chainId;
      case 'net_version': return String(parseInt(state.chainId, 16));
      case 'wallet_switchEthereumChain': {
        state.switchCalls.push(params[0]?.chainId);
        if (params[0]?.chainId !== CC3_HEX) { state.chainId = params[0].chainId; return null; }
        // a wallet that does not know the chain rejects with 4902 the first time
        if (!state.addChainCalls.length) { const e: any = new Error('Unrecognized chain ID'); e.code = 4902; throw e; }
        state.chainId = CC3_HEX; return null;
      }
      case 'wallet_addEthereumChain':
        state.addChainCalls.push(params[0]?.chainId); state.chainId = params[0].chainId; return null;
      case 'personal_sign': {
        state.signCalls++;
        return w.signMessage(getBytes(params[0]));
      }
      case 'eth_sendTransaction': {
        state.sendCalls++;
        const t = params[0];
        const sent = await w.sendTransaction({
          to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined,
          gasLimit: t.gas ? BigInt(t.gas) : undefined,
        });
        return sent.hash;
      }
      default: return rpc.send(method, params ?? []);
    }
  });

  await page.addInitScript({ content: `
    (function () {
      var listeners = {};
      window.ethereum = {
        isMetaMask: true,
        request: function (a) { return window.__walletRpc(a.method, a.params || []); },
        on: function (e, f) { (listeners[e] = listeners[e] || []).push(f); },
        removeListener: function (e, f) { listeners[e] = (listeners[e] || []).filter(function (x) { return x !== f; }); },
        __emit: function (e, v) { (listeners[e] || []).forEach(function (f) { f(v); }); }
      };
    })();
  ` });

  return {
    ctx, page, state,
    async setAccount(a: Acct) {
      state.active = a;
      // tolerate being called before any page has loaded: the account still
      // changes, there is simply nothing yet to notify
      await page.evaluate((addr) => (window as any).ethereum?.__emit?.('accountsChanged', [addr]),
        getAddress(KEYS[a].address)).catch(() => {});
      await page.waitForTimeout(400);
    },
    async close() { await browser.close(); },
  };
}

export const ADDR = (a: Acct) => getAddress(KEYS[a].address);
export const MANIFEST = M;
