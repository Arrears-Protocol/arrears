# The Arrears exploit demo

Two Attestcoin Smart Contracts, each written to follow the documented Readability pattern, each
accepting evidence it should have refused. Both are deployed on Creditcoin CC3 testnet and both
accepted a real proof in a mined transaction.

**Neither is a flaw in Attestcoin.** Every proof involved is sound — those transactions really
happened and those logs really were emitted. What fails is the inference a consuming contract
draws from a correct proof. That distinction is the point, and it is why the fix in both cases is
one guard inside the consumer.

## Verify it

```bash
npm install
npm run verify           # everything: both exploit halves, then the evidence gallery
npm run verify:exploits  # just the two exploits
npm run gallery          # just the evidence gallery and the slash artifact
```

The demo has two surfaces and this README covers the first. The second — seven real mainnet
failures plus the live Sepolia slash — is in [`GALLERY.md`](GALLERY.md).
[`manifest.json`](manifest.json) is the single source of truth for both, and for the frontend:
hashes and addresses only, no fixtures.

No key, no funding, no `.env`, no build step, nothing to deploy. The script re-reads every value
live from CC3, Sepolia and Ethereum mainnet on each run — [`artifacts.json`](artifacts.json)
carries transaction hashes and nothing else, so there is no fixture to fall out of date. It exits
non-zero if any check fails.

Override any endpoint with `CC3_RPC`, `SEPOLIA_RPC` or `ETH_RPC` if the public ones are busy.

---

## Half one — a proven failure accepted as a success

[`NaiveSettlementASC`](../contracts/src/NaiveSettlementASC.sol) proves a source transaction with
`verifyAndEmit`, decodes it with `EvmV1Decoder`, and records a settlement. That is the documented
flow followed exactly. It never reads `receiptStatus`.

| | |
|---|---|
| Source | [`0x06ba12d8…`](https://etherscan.io/tx/0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7) — Ethereum mainnet block 25,916,354, 1inch v6 router, **`status 0x0`** |
| Contract | [`0x5e81f5A1…5d1a2`](https://creditcoin-testnet.blockscout.com/address/0x5e81f5A15a389F9CeAd6fCCE9B2f60035415d1a2) |
| **Accepted** | [`0xbd4eedc2…`](https://creditcoin-testnet.blockscout.com/tx/0xbd4eedc2bd216aa8dd848029d3da992510180cefc73d2794f063587d76393c52) — status 1, 273,896 gas |
| Recorded | `SettlementAccepted(payer 0x8B65363a…, target 0x11111112… , selector 0x07ed2379, gasUsed 386,677)` |
| Strict twin refuses | `SourceTransactionReverted(0, 386677, 598875)` |

The precompile verifies **inclusion in a finalised block**. That is not the same claim as **the
transaction succeeded**, and a reverted transaction is exactly as provable as a successful one.
All three values in the strict twin's error came out of bytes the naive contract already had.

## Half two — a forged event credited to a token it never touched

[`Impostor`](../contracts/src/Impostor.sol) on Sepolia holds no balance, implements no token, and
does one thing: emit `Transfer(address,address,uint256)` with whatever arguments the caller names.

[`NaiveEventASC`](../contracts/src/NaiveEventASC.sol) believes it watches real Sepolia USDC. It
proves a transaction, walks the receipt's logs, and accepts the first whose `topics[0]` matches
the `Transfer` signature — the exact predicate of the SDK's own `getLogsByEventSignature`. It
never compares `log.address_` to the token it trusts.

| | |
|---|---|
| Impostor | [`0xfC7eAbb2…CacB8`](https://sepolia.etherscan.io/address/0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8) — 279 bytes |
| Forged event | [`0xb7dbe7c2…`](https://sepolia.etherscan.io/tx/0xb7dbe7c2121b048991e136074b3120f20e4ed955e7074f3a3f06df436bdca191) — Sepolia block 11,645,759, claiming **1,000,000 USDC from Circle's treasury** |
| Contract | [`0x7DC1Cc8A…f4DB2`](https://creditcoin-testnet.blockscout.com/address/0x7DC1Cc8A209dB75c05717cb80827dBb66Eff4DB2) — `expectedToken` = real Sepolia USDC |
| **Accepted** | [`0x7d81c702…`](https://creditcoin-testnet.blockscout.com/tx/0x7d81c7023aa1b0a6b820670332603489d94a9dc9591bcdbee12e4797d7c56947) — status 1, 238,378 gas |
| Recorded | `TransferAccepted(emitter 0xfC7eAbb2…, from 0x55FE002a…, amount 1,000,000, emitterWasExpected **false**)` |
| Strict twin refuses | `WrongEmitter(0xfC7eAbb2…CacB8, 0x1c7D4B19…C7238)` |

**It emitted `emitterWasExpected: false` in the same event it accepted the forgery.** It had the
information and acted anyway.

The helper whose predicate this reproduces, `EvmV1Decoder.getLogsByEventSignature`, matches on
`topics[0]` and never reads `logs[i].address_`. It is also not dispatchable in the library
deployed on CC3 — 14 of its 16 ABI functions are — so a developer reaching for it writes this
loop by hand instead. Both points are documented in
[`../PROTOCOL-FINDINGS.md`](../PROTOCOL-FINDINGS.md).

---

## Rebuilding from scratch

The verifier above reads what is already on chain. To redeploy and re-run end to end you need a
funded CC3 key and Sepolia ETH; the drivers are
[`../phase0/probes/23-deploy-and-demo-a.ts`](../phase0/probes/23-deploy-and-demo-a.ts) and
[`../phase0/probes/25-demo-b-impostor.ts`](../phase0/probes/25-demo-b-impostor.ts). They read
credentials from `~/.config/creditcoin/arrears-testnet.json`, never from this repository.

Half two takes about ten minutes end to end: most of it is waiting for Creditcoin to attest the
Sepolia block containing the forged event.
