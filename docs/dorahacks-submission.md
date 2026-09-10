# DoraHacks submission — BUIDL CTC 2026 Fall

Draft text for the form. Every hash below is a value from `demo/manifest.json`, and
`cd deck && npx tsx verify.mts` fails if one is not, or if it does not exist on the chain it
names. The form itself could not be read from here (the page refuses non-browser fetches), so
the headings are the content blocks; map them onto the form's fields and check its length limits.

---

## Name

Arrears

## Tagline

A failed Ethereum transaction, admitted as evidence against a bonded operator.

## Track / sector

**DeFi.** Arrears is a bonded credit line: an operator posts a bond, declares what it answers for,
and a public rule prices its credit from its proven failure record.

## Short description

Arrears is a Creditcoin court that admits a *reverted* Ethereum transaction as evidence. An
operator bonds tCTC and declares a scoped promise — these contracts, these selectors, this block
window. When one of its transactions runs out of gas inside that promise, anyone can prove it
with Attestcoin: the bond is slashed and the credit line reprices in the same transaction. Every
other failure is recorded or refused, on chain, with a named error.

## Description

**The problem.** Relayers, keepers, solvers and bridge executors send transactions other people
depend on. When one fails, the counterparty bears the cost and the operator bears nothing; there
is no record a third party can read and no price attached to unreliability.

**What Arrears does.** An operator registers an Ethereum source address, posts a bond on
Creditcoin, and declares coverage: a set of (contract, selector) pairs and a block window. A
claimant submits an Attestcoin proof of one of that operator's transactions. The court decodes
the proven bytes and rules — one of three outcomes, and none of them is an error:

- **Bond moved.** The transaction ran out of gas (`gasUsed >= gasLimit`) inside the promise. The
  sender chose the limit, so the fault is unambiguously theirs. The bond is slashed and the credit
  line reprices in the same transaction.
- **Record kept.** It reverted deliberately. The failure goes on the operator's permanent record;
  the bond is untouched. 89.7% of reverted mainnet transactions are in this class (647 of 721 in
  200 attested blocks), and slashing them would punish participation.
- **Turned away.** It fell outside the promise. `OutOfScope` names the axis that missed —
  operator, chain, window, target, selector, revoked, expired or exhausted — and nothing is written.

The price is a public function, `ArrearsCreditLine.quote`: each strike cuts the limit 25%,
compounding, and adds 150 bps to the premium. Anyone can evaluate it; a pricing rule nobody can
check is an oracle.

**All four outcomes are mined on CC3 testnet** and readable in an explorer we do not control:

| outcome | ruling |
|---|---|
| bond moved — 2.0 tCTC slashed, limit 1,000 → 750, premium 500 → 650 bps | [`0xa7b1e50e66cff9d5c3e43fc9a6f3986e918b845756dc240c0fe1735b6c976be2`](https://creditcoin-testnet.blockscout.com/tx/0xa7b1e50e66cff9d5c3e43fc9a6f3986e918b845756dc240c0fe1735b6c976be2) |
| record kept — `NotSlashableExplicitRevert` | [`0xe585da11125f0ccbe147ce7ee96642d4e4e8cecd9b253a4d3a0362a3c5cda6c1`](https://creditcoin-testnet.blockscout.com/tx/0xe585da11125f0ccbe147ce7ee96642d4e4e8cecd9b253a4d3a0362a3c5cda6c1) |
| turned away — `OutOfScope(Selector, …)` | [`0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685`](https://creditcoin-testnet.blockscout.com/tx/0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685) |
| turned away, strict path — wrote nothing, `claim.ruledAt == 0` | [`0xc0bf98c0231b2d059fd8a824c1c41f4cd224698cf159629582f64e2f7c4463c7`](https://creditcoin-testnet.blockscout.com/tx/0xc0bf98c0231b2d059fd8a824c1c41f4cd224698cf159629582f64e2f7c4463c7) |

**Built:** the bond, scoped coverage, the slash, the price. **Not built:** drawing on the line.

**What we take on trust — one thing.** An Attestcoin proof names an Ethereum address; nothing in
it connects that address to a Creditcoin identity. The registry binds them with an EIP-191
signature checked by `ecrecover`. It is the only claim in the system the precompile does not
verify, and it is stated in the README and on the site rather than in a code comment.

Testnet, unaudited.

---

## Attestcoin integration

### The fact the design stands on: a reverted transaction is admissible evidence

The documented Attestcoin pattern is event-driven — prove a transaction, read its logs. Arrears
proves transactions that **failed**, and a failed transaction has no logs at all: 813 of 813
reverted mainnet transactions we measured carried zero logs and an all-zero bloom, because a
top-level revert rolls back the journal.

So before any code, we asked whether a reverted Ethereum mainnet transaction could be proven on
Creditcoin at all. It can. Mainnet transaction
[`0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7`](https://etherscan.io/tx/0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7)
reverted at block 25,916,354; its proof verifies `true` against the block-prover precompile, and
`EvmV1Decoder.decodeReceiptFields` reads `receiptStatus` back as `0` on chain. A naive contract
we deployed accepted that exact failure as a completed settlement in
[`0xbd4eedc2bd216aa8dd848029d3da992510180cefc73d2794f063587d76393c52`](https://creditcoin-testnet.blockscout.com/tx/0xbd4eedc2bd216aa8dd848029d3da992510180cefc73d2794f063587d76393c52)
— which is the vulnerability Arrears exists to turn into a mechanism. Its strict twin refuses the
same proof with `SourceTransactionReverted(0, 386677, 598875)`.

The decoder reads `from`, `to`, calldata and `status` on any proven transaction, for anyone who
thinks to ask. Arrears is the first design we know of that makes a *failure* load-bearing.

### What we call

| surface | call | used for |
|---|---|---|
| block-prover precompile `0x…0FD2` | `verifyAndEmit` | `submitClaim` — the proof a ruling rests on |
| | `verify` (view) | `previewClaim` — the free, exact prediction of a ruling before any gas is spent |
| | `calculateTxIndex` | deriving the claim id, so the same failure cannot be ruled twice |
| `EvmV1Decoder` (linked) | `decodeCommonTxFields`, `decodeReceiptFields` | `from`, `to`, selector, `gasLimit`, `receiptStatus`, `receiptGasUsed` — everything the verdict reads |
| hosted prover + `@gluwa/usc-sdk` | proof by transaction hash | building proofs in the browser and the relayer |
| source chains | Ethereum mainnet (key 3), Sepolia (key 1) | seven historical mainnet failures classified at real scale; the bonded slash on Sepolia, where we hold the operator's key |

The whole verdict is three lines in `ArrearsVerdict.classify`, declared `internal` so the compiler
inlines the same bytes into the court and into the probe that classifies the mainnet gallery.

### Constraints we designed around rather than worked around

Each of these is a property of the protocol that shaped a decision, not a bug we patched:

1. **A failure carries no logs.** So nothing in Arrears reads an event from the evidence. It is
   built entirely on receipt and transaction fields the proof commits to.
2. **No revert reason is committed.** Revert return data is not part of what Attestcoin proves,
   so "why it failed" is unknowable on chain. That is why the slashable class is the one fact
   that needs no reason: `gasUsed >= gasLimit`. Every explicit revert is recorded and never
   slashed.
3. **A revert mined through the precompile carries no return data.** Our own out-of-scope ruling
   ([`0xd9f96284…`](https://creditcoin-testnet.blockscout.com/tx/0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685))
   reverted with none, while the identical call over `eth_call` returned the named error in full.
   So refusal reasons come from `previewClaim` over `eth_call`, and the interface never tries to
   read a reason from a failed transaction.
4. **Attestation lags the source chain** — 41 Sepolia blocks, about eight minutes, broadcast to
   provable. Arrears cannot intercept a failure, and does not try: slashing a bond after a proven
   failure has no real-time requirement. The same cadence would be fatal to a liquidation guard.
5. **A proof says a log exists, not who is entitled to have emitted it.** The precompile is right
   not to claim that. Arrears never trusts a log, and we demonstrated the documented pattern's
   footgun on chain: a 279-byte contract on Sepolia,
   [`0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8`](https://sepolia.etherscan.io/address/0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8),
   emitted a forged 1,000,000 USDC `Transfer`, and a contract matching by signature credited it in
   [`0x7d81c7023aa1b0a6b820670332603489d94a9dc9591bcdbee12e4797d7c56947`](https://creditcoin-testnet.blockscout.com/tx/0x7d81c7023aa1b0a6b820670332603489d94a9dc9591bcdbee12e4797d7c56947).
6. **A proof names an Ethereum address and nothing more.** Hence the EIP-191 registration — and
   hence the one trust assumption, named rather than hidden.

### What we measured, and what we got wrong

Six findings, each with its probe and raw transcript, in
[`PROTOCOL-FINDINGS.md`](https://github.com/Arrears-Protocol/arrears/blob/main/PROTOCOL-FINDINGS.md):
the published gas formula holds to within 2.6% once you sample heights that are not attestation
checkpoints; `estimateGas` against the precompile over-estimated all seven mined batch
verifications we compared, by 0.17%–7.56%, and never under; the batch overloads cap at ten
proofs, a protocol bound rather than a gas one.

One finding was wrong. We reported that two `EvmV1Decoder` functions were missing from the
deployed bytecode. Both are there. `EvmV1Decoder` is a library, a public library function names a
struct parameter canonically, and standard ABI tooling derives a selector the library does not
dispatch — which reverts with no data, exactly like a missing function. It surfaced because
Creditcoin asked for our reproduction rather than our conclusion. The correction sits at the top
of that finding rather than replacing it.

### Check it

No key, no funds, no `.env`:

```
git clone https://github.com/Arrears-Protocol/arrears && cd arrears/demo && npm install && npm run verify
```

It re-reads both exploit halves and all seven mainnet failures live from CC3, Sepolia and
Ethereum mainnet.

---

## Links

| | |
|---|---|
| Live site | https://arrears.0xo.in |
| Source | https://github.com/Arrears-Protocol/arrears |
| Deck (PDF) | https://arrears.0xo.in/arrears-deck.pdf |
| Video | *to follow — not shot until participants have filed* |

**Contracts — Creditcoin CC3 testnet, verified on Blockscout**

| | |
|---|---|
| ArrearsRegistry | [`0x66bBEAe928E6E86263E0161948F9309d53f56454`](https://creditcoin-testnet.blockscout.com/address/0x66bBEAe928E6E86263E0161948F9309d53f56454) |
| ArrearsCourt | [`0xdcB573069D8A58b97732b6b1DdaF859A85be702f`](https://creditcoin-testnet.blockscout.com/address/0xdcB573069D8A58b97732b6b1DdaF859A85be702f) |
| ArrearsCreditLine | [`0x53853218595a0219499E2422e641F03B2b5f38DD`](https://creditcoin-testnet.blockscout.com/address/0x53853218595a0219499E2422e641F03B2b5f38DD) |
| VerdictProbe | [`0x57b758c8137d0454f84fcCDc6a5b1f62D33c9e52`](https://creditcoin-testnet.blockscout.com/address/0x57b758c8137d0454f84fcCDc6a5b1f62D33c9e52) |
