# The evidence gallery

Seven real Ethereum mainnet failures, 2023–2025, plus the live Sepolia slash artifact. Each is
proven through the block-prover precompile and classified by the deployed
[`VerdictProbe`](../contracts/src/VerdictProbe.sol) on CC3.

```bash
npm install && npm run gallery
```

No key, no funding, no `.env`. Every value is re-read from chain on each run;
[`manifest.json`](manifest.json) holds hashes and addresses and nothing else. Non-zero exit if any
check fails.

---

## Why there are two surfaces, and why that is the argument

**The gallery and the Sepolia slash run the identical verification path.** `VerdictProbe`
classifies with [`ArrearsVerdict`](../contracts/src/ArrearsVerdict.sol) — the same library
[`ArrearsCourt`](../contracts/src/ArrearsCourt.sol) uses to reach a ruling. Not a
reimplementation, not a mirror: the same `internal` function, linked into both. Nothing can drift.

What each surface establishes is different, and neither is complete alone:

| | what it proves |
|---|---|
| **The mainnet gallery** | that the classification is *right*, against real failures at real scale — seven of them, across three years and four separate market events, none of them constructed by us |
| **The Sepolia slash** | that the ruling those classifications lead to *lands* — a bond, a coverage, a proven failure, a slash, end to end |

No bond attaches to the mainnet seven, because nobody here holds those keys. That is not a gap in
the demo — **it is the identity binding working.** Arrears' registry requires an operator to prove
control of the source-chain address its bond answers for, so a project that could slash arbitrary
mainnet addresses on demand would be one that never checked. The split exists because the check is
real, and it is evidence of that rather than a limitation of it.

---

## The slash artifact

| | |
|---|---|
| Source | [`0xe11a3557…`](https://sepolia.etherscan.io/tx/0xe11a3557f5e32c939f05c6d752036131cde5ed498520887b36b9f68676bbbf12) — Sepolia block 11,646,331, index 97 |
| What it is | a real `WETH.deposit()` that honestly needed **45,418 gas** and was sent **30,000** |
| Result | enters the contract, starts work, dies mid-SSTORE. `gasUsed == gasLimit == 30,000`, `receiptStatus 0`, zero logs |
| Verdict | **`OutOfGas` — slashable** |

Not a contract built to burn gas. An under-provisioned limit against real work, which is exactly
how it happens in production when someone hardcodes a stale number. Same artifact class as the
mainnet Uniswap V2 router failure below, on a chain where we hold the key.

## The seven

Every one classified **`OutOfGas`**. Every one carries zero logs, as every reverted transaction
does. Continuity-proof length varies with how far the block sits from an attestation checkpoint,
which is why the older entries are dearer to prove.

| window | source | block | continuity roots | gasUsed / gasLimit |
|---|---|---|---|---|
| USDC depeg (SVB) | [`0xc22eb305…`](https://etherscan.io/tx/0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096) — Uniswap V2 Router `swapExactTokensForETHSupportingFee` | 16,806,527 | 474 | 324,239 / 324,239 |
| USDC depeg (SVB) | [`0x1dd76820…`](https://etherscan.io/tx/0x1dd76820f55cc790a57ed33eee30ed25d120f6f0820a89c1f55a6c2dc7e71c22) | 16,806,523 | 478 | 77,600 / 77,600 |
| Yen carry unwind | [`0x252a53c5…`](https://etherscan.io/tx/0x252a53c5d5fa0706ba15624c62db62300708eb9dbe14454af7a73f8fed6625e4) | 20,462,242 | 759 | 134,138 / 134,138 |
| Yen carry unwind | [`0xbf4a6412…`](https://etherscan.io/tx/0xbf4a64126832f98707b723de0bc68b5883144313d5e8f2cb627847193aa206d0) — USDT transfer | 20,462,236 | 765 | 76,808 / 76,808 |
| Feb 2025 selloff | [`0x3198a097…`](https://etherscan.io/tx/0x3198a097f62d37dc2463b87adf87419621a8bf45e014491c0f9911aa09224fcc) | 21,769,440 | 561 | 134,482 / 134,482 |
| Oct 2025 cascade | [`0x27cb5855…`](https://etherscan.io/tx/0x27cb58551d34f7b1a48fabdbfc8ca078a2e7aaf0bed52b425a980cd11d4a967c) — USDT transfer | 23,549,876 | 125 | 120,000 / 120,000 |
| Oct 2025 cascade | [`0xee76fbbb…`](https://etherscan.io/tx/0xee76fbbb8fe207a1af967a751dd5dd2c0b3fb6ae3f061ec108fc13d12df3c756) — USDT transfer | 23,549,876 | 125 | 80,000 / 80,000 |

### They were re-classified, not carried over

These were first classified during Phase 0, from mainnet RPC receipts, **before `Verdict` existed
and before the slashable class was narrowed to out-of-gas.** Carrying that forward on trust would
have been exactly the kind of unchecked claim this project exists to avoid, so all seven were
re-run through the deployed classifier and diffed against what the Phase 0 transcript asserted:

```
re-classified 7 of 7 through the deployed classifier
all proofs valid:      true
all zero logs:         true
classified OutOfGas:   7/7

NO DISCREPANCIES. Every Phase 0 classification survives the narrowed rule.
```

The on-chain decoded `gasUsed` and `gasLimit` match the mainnet receipts exactly in all seven
cases. Transcript: [`../phase0/evidence/29-reclassify.json`](../phase0/evidence/29-reclassify.json).
Re-run it yourself with `npx tsx probes/29-reclassify.ts` from `phase0/` — it exits non-zero on
any divergence, so a future change to the classification rule that would move one of these gets
caught by a script rather than on camera.

---

## The rulings, and why the refusals matter as much as the slash

Mined by the deployed [`ArrearsCourt`](https://creditcoin-testnet.blockscout.com/address/0xdcB573069D8A58b97732b6b1DdaF859A85be702f),
source-verified so the explorer decodes these events itself. A relayer paid the gas; a separate
beneficiary was credited, which is how sponsored submission works without any meta-transaction
machinery.

### The slash

[`0xa7b1e50e…`](https://creditcoin-testnet.blockscout.com/tx/0xa7b1e50e66cff9d5c3e43fc9a6f3986e918b845756dc240c0fe1735b6c976be2)
· status 1 · 620,046 gas

```
previewClaim (free)  valid=true  verdict=OutOfGas  miss=None  wouldSlash=2.0 tCTC
ClaimRuled           verdict=OutOfGas  slashed=2.0 tCTC  beneficiary=0xD2973C89…
BondSlashed          2.0 tCTC taken, 18.0 remaining
LineRepriced         limit 1000 → 750 tCTC, premium 500 → 650 bps, strikes 1
treasury             0.0 → 2.0 tCTC
```

The free preview predicted the ruling exactly. The reprice happened in the same transaction as the
slash, so there is no window where the bond has moved but the credit line still shows the old
price.

### The refusals

A rule that only ever says yes is not a rule. These are the mined transactions where the court
says no, and they are worth as much as the slash.

**Explicit revert — recorded, not slashed.**
[`0xe585da11…`](https://creditcoin-testnet.blockscout.com/tx/0xe585da11125f0ccbe147ce7ee96642d4e4e8cecd9b253a4d3a0362a3c5cda6c1)
· status 1 · 528,388 gas

```
ClaimRuled    verdict=ExplicitRevert  slashed=0.0 tCTC
SlashRefused  reason=0x6bf93631  gasUsed=24187  gasLimit=100000
```

`0x6bf93631` is the selector of `NotSlashableExplicitRevert`, so the refusal is a named error in
the ABI rather than a string — a client decodes it against the same error list the strict path
reverts with. The treasury did not move. The failure is on the operator's record and cost them
nothing, which is the intended outcome: the callee rejected the call, and Arrears cannot prove
from attested bytes that the state had not moved underneath them.

**Out of scope — refused, naming the axis.**
[`0xd9f96284…`](https://creditcoin-testnet.blockscout.com/tx/0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685)
· mined as a failed transaction

```
OutOfScope(miss=Selector, target=0xfFf99767…6B14, selector=0x2e1a7d4d, height=11646965)
```

A real WETH `withdraw()` failure by the bonded operator, inside the covered window, on the covered
contract — and refused, because `withdraw(uint256)` is in no coverage's scope. The error names
`Selector` specifically, so the submitter learns the one thing that missed rather than being told
only that something did.

Worth noting how that was read: the relayer's mined transaction came back from the node with
**no revert data** — as every mined revert does, because a receipt never carries return data. The
same call over `eth_call` returns the named error in full, and Blockscout decodes it for the mined
transaction as well. That is why a front-end should preview over `eth_call` rather than try to
read a failed transaction's reason off its receipt.

*Corrected 10 September 2026: this paragraph previously blamed `pallet-evm` for the missing data
and cited PROTOCOL-FINDINGS finding 2, which is about `estimateGas`. See
[`../docs/principles.md`](../docs/principles.md) rule 4.*

**Strict path — refuses and records nothing.**
[`0xc0bf98c0…`](https://creditcoin-testnet.blockscout.com/tx/0xc0bf98c0231b2d059fd8a824c1c41f4cd224698cf159629582f64e2f7c4463c7)
· mined as a failed transaction

```
NotSlashableExplicitRevert(24187, 100000)
```

`submitClaim` and `submitSlashingClaim` see the same evidence and answer differently by design:
one records the failure and declines to slash it, the other declines outright and leaves no trace.
After this transaction `claim.ruledAt == 0` — nothing was written, which is the whole point of
offering both shapes. A caller who only wants to slash spends nothing on a claim that would not
have slashed.

**Order matters, and finding this out cost us a transaction.** The first attempt asked for the
strict refusal *after* `submitClaim` had already recorded the same evidence, and got
`AlreadyClaimed` instead of the named error. Recording is what consumes the globally unique claim
id, so the strict path has to be asked first. That was a flaw in the driver script, not in the
contract, and it is worth knowing before a front-end wires the two buttons up in the wrong order.

### Final operator state

```
bonded 18.0   committed 8.0   slashed 2.0 tCTC
credit limit 750.0 tCTC   premium 650 bps   strikes 1
claims on record: 2
```

---

## Timing

Broadcast to provable on Sepolia is **41 blocks, about eight minutes** — measured, not estimated.
The gallery opens on artifacts that are already attested, so nothing waits.

That lag makes Arrears a **settlement-time mechanism rather than an interception one**. It cannot
stop a failure; by the time anything is provable the transaction has been final for minutes. But
slashing a bond after a proven failure has no real-time requirement — the failure already
happened and the fault is already fixed — so the cadence costs the design nothing. See
[`../docs/claim-submission.md`](../docs/claim-submission.md).
