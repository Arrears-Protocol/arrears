# The real-user self-test

Every write path in this project had only ever been exercised by scripts holding
the keys directly. That tests the contracts. It does not test **the app** — the
browser extension, the wallet prompt, the network switch, gas coming out of the
user's own balance. That is what an external participant hits, and none of it
existed as tested until this suite did.

```bash
npm install
npx playwright install chrome        # once
npm run all --url=https://arrears.0xo.in
```

Every script takes a URL, so the same suite runs against localhost, a Vercel
preview, or production unchanged.

## How it works

[`harness.mts`](harness.mts) injects an EIP-1193 provider **before any page
script runs** and proxies every request over a Playwright binding to Node, where
the keys live. The page never sees a private key. Every signature is a real
signature and every transaction is really mined.

It starts on **Ethereum mainnet, not Creditcoin**, because a wallet that has
never seen CC3 is the normal case for a first-time user and the switch path is
the one most likely to be broken. `eth_accounts` returns `[]` until
`eth_requestAccounts` has been approved, so the connect flow is actually walked
rather than skipped. `wallet_switchEthereumChain` rejects with `4902` the first
time, the way a wallet that does not know a chain does.

**What it does not cover:** MetaMask's own popup copy and approval UX. Everything
on our side of that boundary is exercised.

## The suite

| script | walks |
|---|---|
| [`1-connect.mts`](1-connect.mts) | connect from the landing page and from `/dashboard`, disconnect, reconnect, the wrong-network warning, the add-chain path, and the observer view with no wallet |
| [`2-register.mts`](2-register.mts) | the two-wallet registration wizard end to end — source key signs, controller submits, digest checked against the deployed registry first |
| [`3-claim.mts`](3-claim.mts) | a self-funded claim: free preview, submission, and confirming the ruling credits a beneficiary that is **not** the sender |
| [`4-unfunded.mts`](4-unfunded.mts) | an empty wallet, which is what an external participant arrives with — asserts the funding wall appears and **no transaction is attempted** |
| [`5-operators.mts`](5-operators.mts) | an account controlling two operators, an account controlling none, and the public record for both |
| [`6-nojs.ts`](6-nojs.ts) | the landing page with JavaScript disabled: 19 content assertions plus effective rendered opacity for all six sections |

## What it has caught

Not hypothetical — each of these was live when the suite found it.

- **Connect existed nowhere on the landing page**, though it was specified as an
  entry point.
- **Step 3 of the wizard showed a disabled button reading "switch to Creditcoin
  CC3"** that did nothing when clicked. A control that names an action must
  perform it.
- **The operator console resolved only the manifest operator**, so anyone who
  registered landed on "no operator for this account" immediately after
  succeeding.
- **The funding wall gated the whole operator console**, including the read-only
  record — the same "gate the button, never the explanation" rule broken again,
  by the fix for a different problem.

## One trap, recorded because it nearly cost an afternoon

`tsx` and `esbuild` rewrite a function passed to `addInitScript` and inject a
`__name` helper that does not exist in the browser. The script throws,
`window.ethereum` is never defined, and the app correctly reports **"no wallet"** —
which looks exactly like an app bug. Pass init scripts as a **string**:

```ts
await page.addInitScript({ content: `(function () { window.ethereum = { … }; })();` });
```

Same class as sampling round block numbers when benchmarking Attestcoin: the tool
lies in a way that looks like a finding. See
[`../docs/principles.md`](../docs/principles.md).
