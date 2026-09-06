'use client';
import {
  BrowserProvider, Contract, JsonRpcSigner, AbiCoder, keccak256, toUtf8Bytes,
  getAddress, parseEther, getBytes, concat, type Eip1193Provider,
} from 'ethers';
import { M } from './manifest';

/**
 * Wallet access for the dashboard, and ONLY the dashboard.
 *
 * Deliberately plain EIP-1193 over ethers rather than a connector library. The
 * landing page must stay readable with nothing installed and nothing connected,
 * and the surest way to keep that true is for the wallet layer to be small,
 * client-only, and imported by no route the landing page renders.
 *
 * Nothing here is used by `/`.
 */

export const CC3 = {
  chainIdDec: M.chains.cc3.chainId,
  chainIdHex: '0x' + M.chains.cc3.chainId.toString(16),
  name: M.chains.cc3.name,
  rpc: M.chains.cc3.rpc,
  explorer: M.chains.cc3.explorer,
};

declare global {
  interface Window { ethereum?: Eip1193Provider & { on?: Function; removeListener?: Function; isMetaMask?: boolean } }
}

export const hasWallet = () => typeof window !== 'undefined' && !!window.ethereum;

export async function connect(): Promise<{ address: string; chainId: number }> {
  if (!hasWallet()) throw new Error('No wallet found. Install MetaMask or another EIP-1193 wallet.');
  const p = new BrowserProvider(window.ethereum!);
  const accounts: string[] = await window.ethereum!.request({ method: 'eth_requestAccounts' });
  const net = await p.getNetwork();
  return { address: getAddress(accounts[0]), chainId: Number(net.chainId) };
}

export async function currentAccount(): Promise<{ address: string; chainId: number } | null> {
  if (!hasWallet()) return null;
  try {
    const accounts: string[] = await window.ethereum!.request({ method: 'eth_accounts' });
    if (!accounts?.length) return null;
    const p = new BrowserProvider(window.ethereum!);
    const net = await p.getNetwork();
    return { address: getAddress(accounts[0]), chainId: Number(net.chainId) };
  } catch { return null; }
}

/** Add or switch to Creditcoin CC3. Needed before any write. */
export async function ensureCC3(): Promise<void> {
  if (!hasWallet()) throw new Error('No wallet');
  try {
    await window.ethereum!.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CC3.chainIdHex }] });
  } catch (e: any) {
    if (e?.code === 4902 || /Unrecognized chain/i.test(e?.message ?? '')) {
      await window.ethereum!.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CC3.chainIdHex, chainName: 'Creditcoin CC3 Testnet',
          nativeCurrency: { name: 'Testnet CTC', symbol: 'tCTC', decimals: 18 },
          rpcUrls: [CC3.rpc], blockExplorerUrls: [CC3.explorer],
        }],
      });
    } else throw e;
  }
}

export async function signer(): Promise<JsonRpcSigner> {
  const p = new BrowserProvider(window.ethereum!);
  return p.getSigner();
}

/* ── the identity binding ───────────────────────────────────────────────────
   The registry checks `ecrecover(prefixedDigest, sig) == sourceAddress`, where
   prefixedDigest = keccak256("\x19Ethereum Signed Message:\n32" || inner).

   A browser wallet will not sign a raw 32-byte digest — `personal_sign` always
   applies that prefix itself. So the wallet is asked to sign the INNER hash,
   and the prefix the wallet adds reproduces exactly what the contract checks.

   The UI shows both, and verifies the pair against the contract's own
   `registrationDigest` before asking anyone to sign anything. */

export function innerDigest(controller: string, sourceAddress: string, chainKey: number, registry: string, chainId: number) {
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ['string', 'uint256', 'address', 'address', 'address', 'uint64'],
    ['Arrears:registerOperator:v1', chainId, registry, getAddress(controller), getAddress(sourceAddress), chainKey],
  ));
}

export function prefixed(inner: string) {
  // ethers' byte helpers, not Buffer: this runs in the browser.
  return keccak256(concat([toUtf8Bytes('\x19Ethereum Signed Message:\n32'), getBytes(inner)]));
}

/** personal_sign over the inner hash. The wallet adds the prefix the contract expects. */
export async function signInner(inner: string, from: string): Promise<string> {
  return window.ethereum!.request({ method: 'personal_sign', params: [inner, from] }) as Promise<string>;
}

/* ── contracts, write-side ─────────────────────────────────────────────────── */

export const REGISTRY_ABI = [
  'function registerOperator(address sourceAddress, uint64 chainKey, bytes proofOfControl) returns (bytes32)',
  'function registrationDigest(address controller, address sourceAddress, uint64 chainKey) view returns (bytes32)',
  'function operatorIdOf(uint64 chainKey, address sourceAddress) pure returns (bytes32)',
  'function isRegistered(bytes32) view returns (bool)',
  'function postBond(bytes32 operatorId) payable',
  'function declareCoverage(bytes32 operatorId, uint64 chainKey, uint64 fromHeight, uint64 toHeight, uint256 committed, uint256 perClaimCap, uint64 claimDeadline, (address target, bytes4 selector)[] scope) returns (bytes32)',
  'function revokeCoverage(bytes32 coverageId, uint64 atHeight)',
  'function requestWithdrawal(bytes32 operatorId, uint256 amount)',
  'function withdrawBond(bytes32 operatorId, address to)',
  'function operator(bytes32) view returns ((address controller, address sourceAddress, uint64 chainKey, uint256 bonded, uint256 committed, uint256 slashed, uint64 withdrawableAt))',
  'function coverage(bytes32) view returns ((bytes32 operatorId, uint64 chainKey, uint64 fromHeight, uint64 toHeight, uint256 committed, uint256 drawn, uint256 perClaimCap, uint64 claimDeadline, bool active, uint64 revokedAtHeight, bool released, uint64 seq))',
  'function coverageScope(bytes32) view returns ((address target, bytes4 selector)[])',
  'function coveragesOf(bytes32) view returns (bytes32[])',
  'function freeBond(bytes32) view returns (uint256)',
  'function payable_(bytes32) view returns (uint256)',
  'function unbondingPeriod() view returns (uint64)',
  'function minChallengePeriod() view returns (uint64)',
];

export const COURT_WRITE_ABI = [
  'function submitClaim(bytes32 operatorId, uint64 height, bytes txBytes, (bytes32,(bytes32,bool)[]) merkleProof, (bytes32,bytes32[]) continuityProof, address beneficiary) returns (bytes32, uint8, uint256)',
  'function submitSlashingClaim(bytes32 operatorId, uint64 height, bytes txBytes, (bytes32,(bytes32,bool)[]) merkleProof, (bytes32,bytes32[]) continuityProof, address beneficiary) returns (bytes32, uint256)',
];

export const registryWrite = async () => new Contract(M.contracts.arrearsRegistry.address, REGISTRY_ABI, await signer());
export const courtWrite = async () => new Contract(M.contracts.arrearsCourt.address, COURT_WRITE_ABI, await signer());

export const eth = (v: string) => parseEther(v);
