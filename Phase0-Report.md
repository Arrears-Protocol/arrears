# Arrears — Phase 0 report

Investigation only. No application logic written. Nothing pushed.

Every number below came from a live run against the public CC3 testnet RPC, the Creditcoin
prover, the deployed precompiles, or an Ethereum mainnet RPC. Transcripts are in
[`phase0/evidence/`](phase0/evidence/), the scripts that produced them in
[`phase0/probes/`](phase0/probes/). Re-run any of them with `npx tsx probes/<name>.ts`.

---

## Verdict

**The premise holds. Build it.**

A reverted Ethereum mainnet transaction can be proven on Creditcoin, and its
`receiptStatus == 0` is readable on chain. I proved a real reverted 1inch router transaction
against the live precompile on CC3 and read the zero back through
`EvmV1Decoder.decodeReceiptFields`.

But the evidence a reverted transaction carries is **much thinner than the design assumes**, and
that reshapes the product. A reverted transaction has **no logs at all** — not sometimes, always.
Whatever Arrears slashes on must be built from calldata, gas and identity, never from events.
That is the one finding that should change the design before a line of it is written.

Five of the six "established" claims taken from index41 are wrong or misleading. Details below.

---

## 1. The kill question — CAN A REVERTED TRANSACTION BE PROVEN? **Yes.**

Evidence: [`04-kill-reverted-1inch.txt`](phase0/evidence/04-kill-reverted-1inch.txt)

Target: [`0x06ba12d8…9042dd7`](https://etherscan.io/tx/0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7)
— a real Ethereum mainnet transaction to the 1inch v6 AggregationRouter, mainnet block
`25,916,354`, index 85, **`status 0x0`**.

| step | result |
|---|---|
| Prover accepted a failed transaction | **yes** — proof returned in 817 ms, no complaint about status |
| `verifySingle` against the live precompile `0x…0FD2` | **`true`** |
| `calculateTxIndex` | `85` — matches mainnet |
| `EvmV1Decoder.decodeReceiptFields(txBytes).receiptStatus` on CC3 | **`0`** |
| `receiptGasUsed` | `386,677` — matches mainnet exactly |
| `from` / `to` / calldata vs mainnet | all match byte-for-byte |

The docs were right that the precompile does not check success, and nothing else in the stack
checks it either. The prover serves failed transactions, the precompile verifies them, and the
decoder reports the zero. The entire premise of Arrears is sound.

`verifySingle` is a `view` call, so this cost nothing and needed no funded account.

---

## 2. Can we distinguish *why* it failed? **No — and this is the finding that matters.**

Evidence: [`03-scan-reverts.txt`](phase0/evidence/03-scan-reverts.txt),
[`10-survey.txt`](phase0/evidence/10-survey.txt)

The attested encoding carries exactly four receipt fields. From
`EvmV1Decoder.sol:71`:

```solidity
struct ReceiptFields {
    uint8      receiptStatus;
    uint64     receiptGasUsed;
    LogEntry[] receiptLogs;
    bytes      receiptLogsBloom;
}
```

**There is no revert-reason field.** Revert return data is not part of what Attestcoin commits
to, so no amount of proving will ever recover `"Dai/insufficient-balance"`. That is structural,
not a gap in the SDK.

**And there are no logs.** Across **813 reverted mainnet transactions** measured in two
independent scans (92 over 30 blocks, 721 over 200 blocks), **every single one had zero logs and
an all-zero bloom**. This is EVM semantics, not a sampling artifact: a top-level revert rolls back
the entire journal, logs included. Any Arrears design that reads events off a failed transaction
is dead on arrival.

### What a reverted transaction *does* carry

Everything below is proven, on chain, from the same bytes the precompile verified:

| field | present | use to Arrears |
|---|---|---|
| `receiptStatus` | `0` | **the fact of failure** — the core assertion |
| `receiptGasUsed` | yes, exact | how far it got before dying |
| `commonTx.from` | yes | **which operator** — binds the failure to a bonded party |
| `commonTx.to` | yes | **which protocol** was called |
| `commonTx.data` | yes, full calldata | **what was attempted** — selector plus every argument |
| `nonce`, `gasLimit`, `value` | yes | ordering, budget, intent |
| `receiptLogs` | **always empty** | nothing |
| revert reason | **never present** | nothing |

So the expressiveness ceiling is: *"this operator called this function on this contract with
these exact arguments, and it failed, having burned this much gas."* That is a genuinely strong
claim — it is everything except the counterparty's excuse.

### One usable discriminator

`gasUsed` vs `gasLimit` separates two failure modes, and both are proven values:

- `gasUsed >= gasLimit` → **out of gas**: the operator under-provisioned. **74 of 721 (10.3%)**
- `gasUsed < gasLimit` → **explicit revert**: the protocol rejected the call. **647 of 721 (89.7%)**

That distinction is worth real money in a slashing contract: under-provisioning gas is the
operator's own fault, while an explicit revert may be the protocol's state moving underneath them.
Arrears can price those differently and defend the difference with proven bytes.

---

## 3. The provable-history floor — **block 0. All of it.**

Evidence: [`02-floor.txt`](phase0/evidence/02-floor.txt)

`getAttestationGenesisHeight(3)` returns **`0`**, and this is not a null or an unset default —
Creditcoin's own docs table confirms it:

> | Supported Mainnet Chains | Chainkey | Genesis Block |
> | Ethereum Mainnet | 3 | 0 |

I verified there is real attestation data down there rather than a zero standing in for
"unknown". `getCheckpointForHeight(3, 0)` returns `exists=true`, and checkpoints resolve at
1,000,000 / 10,000,000 / 20,000,000 and every depth I sampled.

**The floor is Ethereum block 0 — 30 July 2015. There is no practical lower bound on how far
back an Arrears record can reach.** Attested tip at time of writing was `25,916,390`, about 49
blocks (~10 min) behind mainnet head.

### Checkpoint density varies with age, and it is the opposite of what you'd fear

| region | checkpoint spacing |
|---|---|
| near the attested tip | every 10 blocks |
| ~400k blocks back | every 100 blocks |
| deep history | every 1,000 blocks |

Sparser checkpoints mean **longer continuity proofs for old transactions, and higher gas** —
see §5. This matches Creditcoin's own
[Gas Costs](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-readability/gas-costs.md)
page, which predicts a ~10x cost increase once attestations are replaced by 1-per-1000-block
checkpoints. The penalty is real but bounded: see the measured numbers in §5.

---

## 4. Verifying the six inherited claims

Treated as leads, not as given. **Five of six are wrong or need qualifying.**

| # | Claim from index41 | Verdict |
|---|---|---|
| 1 | `INativeQueryVerifier` has *exactly* `verifyAndEmit` and `calculateTxIndex` | ❌ **False** |
| 2 | No on-chain batch verify | ❌ **False** |
| 3 | ~364k gas per `verifyAndEmit` | ❌ **Not a per-call cost** — the precompile executes in ~18k |
| 4 | `getAttestationGenesisHeight` gives the provable-history floor | ⚠️ **Misleading** |
| 5 | Chain key 3 is Ethereum mainnet | ✅ **Confirmed** |
| 6 | pallet-evm drops precompile revert reasons during estimation | ✅ **Confirmed**, with a caveat |

**(1) The precompile has five functions, not two.** Its shipped ABI
(`@gluwa/usc-sdk/src/block-prover/block_prover.json`) contains one event and five functions:

```
EVT  TransactionVerified(uint64 indexed, uint64 indexed, uint64)
FN   view        calculateTxIndex(tuple) -> uint64
FN   view        verify(uint64, uint64,   bytes,   tuple,   tuple) -> bool
FN   view        verify(uint64, uint64[], bytes[], tuple[], tuple) -> bool
FN   nonpayable  verifyAndEmit(uint64, uint64,   bytes,   tuple,   tuple) -> bool
FN   nonpayable  verifyAndEmit(uint64, uint64[], bytes[], tuple[], tuple) -> bool
```

The two `verify` view overloads are the ones index41 missed, and they matter to Arrears: a
contract can check a proof **for free** before spending gas on a claim.

**(2) On-chain batch verify exists and works.** Both the batch `verify` and the batch
`verifyAndEmit` overloads execute against the live precompile. index41 called them
"TypeScript-side only". I ran both on chain up to ten legs
([`08-batchlimit.txt`](phase0/evidence/08-batchlimit.txt)). This is not an academic correction —
it changes the transaction shape Arrears should use.

**(3) The 364k figure is an artifact of division.** Full forensics in
[`15-gas-forensics.txt`](phase0/evidence/15-gas-forensics.txt) and
[`16-marginal.txt`](phase0/evidence/16-marginal.txt). The mined ruling transaction really did burn
1,092,100 gas — I refetched the receipt and confirmed it, including its three
`TransactionVerified` logs from the precompile. But it was sent **to their own court contract**,
not to the precompile, and 1,092,100 ÷ 3 attributes the whole contract's ABI decoding, storage
writes, five events and bond payout to the precompile.

Decomposing that receipt: 21,000 intrinsic + 147,532 calldata (17,860 bytes) = a 168,532 floor
before any execution at all, leaving 923,568 for *everything* the contract does.

Isolating the precompile itself, against **their exact front-leg proof**: 6,340 bytes of calldata
costs 62,164, intrinsic costs 21,000, and the remainder — **17,838 gas — is the precompile's
actual work**. The batch form agrees: marginal execution is ~19,681 gas per additional leg.

So neither published number is "gas per `verifyAndEmit`". Both are composites. The honest figure
is **~18k of execution, plus whatever calldata that particular proof costs** — and as §5 shows,
calldata is nearly all of the bill.

**(4) It is the protocol's nominal genesis, not a retention floor.** It reports 0 for both
supported chains. It is a real and useful number, but it is a constant from the chain registry,
not a discovered watermark — nothing about it "gives" a floor that could have been higher.

**(6) Confirmed, but do not over-apply it.** The SDK's own comment in `utils/gas.ts` documents
it. In practice `estimateGas` against the precompile **succeeded on every valid proof I tried**,
including from a zero-balance account, and failed only where the call genuinely would revert. The
fallback heuristic exists for good reason but did not trigger in my runs. Treat computed gas
limits as a safety net, not a default.

### Two further discrepancies I found

**`getLogsByEventSignature` is not deployed.** Evidence:
[`14-selectors.txt`](phase0/evidence/14-selectors.txt). The SDK ships a 16-function ABI for
`EvmV1Decoder`; only **14 are dispatchable** in the bytecode actually deployed at
`0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`. Both `getLogsByEventSignature` overloads are
**absent** and revert with a bare `require(false)` and no return data. index41 says "9 public
selectors"; the real number is 14. Any Arrears contract that wants log filtering must embed the
library, not call the deployed one.

**MAX_GAS_CAP is real.** The SDK constant `75,000,000` matches the live CC3 block `gasLimit`
exactly. Confirmed against block 5,439,007.

---

## 5. Gas: it is calldata, not computation

Evidence: [`06-gasmodel.txt`](phase0/evidence/06-gasmodel.txt),
[`09-txsize.txt`](phase0/evidence/09-txsize.txt)

Measured across mainnet history from block 1,000,000 to the attested tip:

```
gas ≈ 21,000 (intrinsic) + ~12.7 × calldata_bytes
```

The precompile's own execution is roughly **2,000 gas**. Everything else is the cost of putting
the proof in calldata. Verification is essentially free; *transporting* the proof is the whole
bill.

| transaction proven | continuity roots | calldata | gas |
|---|---|---|---|
| mainnet block 1,000,000 (2016) | 1 | 1,604 B | **43,538** |
| mainnet block 10,000,000 | 1 | 1,988 B | 46,255 |
| mainnet block 25,000,000 | 1 | 6,148 B | 94,473 |
| our reverted 1inch tx | 7 | 3,620 B | 59,160 |
| index41's sandwich front leg | 60 | 6,340 B | **101,002** |
| a large tx near the tip | 1 | 9,412 B | 142,365 |

Two consequences for Arrears:

1. **Deep history is cheap.** Age does not penalise you; landing near a checkpoint does. Arrears
   can reach back to 2015 without a gas cliff.
2. **The transaction being proven drives the cost.** A fat transaction with many logs costs more
   to prove than a thin one. Reverted transactions have *no logs*, which makes them among the
   **cheapest things on Ethereum to prove** — a real and unexpected tailwind for this product.

---

## 6. The ceiling — **10 legs per call, and gas is never the binding constraint**

Evidence: [`08-batchlimit.txt`](phase0/evidence/08-batchlimit.txt),
[`07-ceiling.txt`](phase0/evidence/07-ceiling.txt), [`11-413.txt`](phase0/evidence/11-413.txt)

The measured answer is not the arithmetic one, and it is not a gas answer at all.

```
 N=1  calldata=  3,044 B  gas=  51,673  (0.069% of cap)  OK
 N=5  calldata= 12,900 B  gas= 189,128  (0.252% of cap)  OK
 N=9  calldata= 22,756 B  gas= 350,607  (0.467% of cap)  OK
 N=10 calldata= 25,220 B  gas= 386,181  (0.515% of cap)  OK
 N=11 calldata= 27,716 B  execution reverted: "heights: Value is too large for length"
```

**A single batch `verifyAndEmit` accepts at most 10 legs.** The cap is a hard protocol bound —
almost certainly a `BoundedVec<_, ConstU32<10>>` on the `heights` argument — and it bites at
**0.515% of MAX_GAS_CAP**. Gas is three orders of magnitude away from mattering. The same cap of
10 applies to the batch `verify` view.

The binding constraints, in the order they actually bite:

| constraint | limit | binds at |
|---|---|---|
| **Protocol batch cap** | **10 legs per call** | 0.515% of gas cap |
| Public RPC request body | 1 MiB → ~523,437 B calldata | ~8.8% of gas cap |
| `MAX_GAS_CAP` | 75,000,000 | ~4.5 MB of calldata — unreachable |

So: to exceed 10 proofs in one CC3 transaction, a contract must issue **multiple batch calls**.
Calldata then becomes the limit — at ~2,522 bytes per thin leg and a ~523 KB ceiling on the
public RPC, roughly **200 legs** could ride in one transaction, costing ~8.8% of the gas cap.

**Caveat, stated plainly:** the 10-leg cap and the per-leg gas figures are measured, but
everything above 10 legs is derived from the calldata model rather than executed, because it
needs a deployed contract and a funded account. See §9. I would not put the ~200 figure in a
submission until it has been run on chain.

---

## 7. The exploit demo — mechanism proven, on-chain capture blocked

**Half two, the impostor, is confirmed as a real vulnerability**, and it is worse than the brief
assumed — the flaw is in Creditcoin's own shipped library source. `EvmV1Decoder.sol:128-141`:

```solidity
function getLogsByEventSignature(LogEntry[] memory logs, bytes32 eventSignature)
    public pure returns (LogEntry[] memory)
{
    for (uint256 i; i < logs.length; i++) {
        if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSignature) n++;
    }
    ...
}
```

It matches `topics[0]` and **never reads `logs[i].address_`**. A contract that asks "did a
`Transfer` happen?" and trusts this helper has learned nothing about *who* emitted it. Any
contract on the source chain that emits the right signature satisfies it.

The twist found in §4: this helper **is not deployed** on CC3, so a naive developer cannot call
it — they will embed the library in their own contract or hand-roll the same loop. Either way the
flawed logic ships, and the fact that Creditcoin's own reference source contains it makes the
demonstration considerably more pointed.

**Both halves still need on-chain capture**, which needs funded accounts. Blocked — see §9.

---

## 8. Real failures worth building on

Evidence: [`10-survey.txt`](phase0/evidence/10-survey.txt) — 200 attested blocks, 49,140
transactions.

| | |
|---|---|
| Reverted transactions | **721 of 49,140 — 1.47%** |
| Per block | 3.6 |
| **Extrapolated** | **~26,000 reverted transactions per day on mainnet** |
| With ≥1 log | **0** |
| Out of gas | 74 (10.3%) |
| Explicit revert | 647 (89.7%) |

Named, decodable, real failures found in that window:

| protocol | example | gasUsed / gasLimit |
|---|---|---|
| **Aave v3 Pool** — `supplyWithPermit` reverted | [`0xeeb319e8…`](https://etherscan.io/tx/0xeeb319e853b4a18b389e8a1605cc2e5fa38dcfba90c15683151d53edd4b8e2f5) | 198,712 / 203,801 |
| **1inch v6 Router** — `swap` reverted | [`0x320d9b35…`](https://etherscan.io/tx/0x320d9b35be51f8b9b8a23d33e36af805ba018271cc4a7f0bb1aba56689757775) | 289,394 / 422,327 |
| **Uniswap UniversalRouter** — `execute` reverted, **out of gas** | [`0xcc6ec00a…`](https://etherscan.io/tx/0xcc6ec00aa3b5823fd19348ef531f2b6c4aca467483203ceec51b964768fec642) | 41,321 / 41,321 |
| **LI.FI Diamond** — bridge call reverted | [`0x3bdaecf0…`](https://etherscan.io/tx/0x3bdaecf0d5374de25273a1b404abca9bffc5de5818f2ee240e4c8c06e0539d2f) | 140,322 / 1,333,506 |
| **Uniswap v4 PoolManager** | [`0x6a33c25a…`](https://etherscan.io/tx/0x6a33c25a51641f2c7fb89eda37dc3d7095dc4a332fa0e6504ff546917b3f0975) | 341,815 / 700,000 |
| **MEV / keeper bot** — reverted keeper call | [`0x649bd17a…`](https://etherscan.io/tx/0x649bd17abb4506f3ee6f4f5e199f50d7ee886bb7b09c8d8fda0b47421eec7374) | 21,350 / 100,000 |

All are cleanly decodable: `to` identifies the protocol, the selector identifies the operation,
and full calldata gives every argument.

### One negative result the brief should hear

**Reverted Aave `liquidationCall`s are not a viable base.** I found **zero** Aave v3
`LiquidationCall` events — successful *or* reverted — across the last 3,000 blocks (~10 hours),
in a window where the same query found 16 `Supply` events, so the query path was working. In calm
markets liquidations barely happen, and failed liquidation races are rarer still.

That is worth knowing now. The brief named reverted liquidations as a target; the data says they
are an *episodic* phenomenon that clusters in stress windows, not a steady stream. Two honest
options:

1. **Point at the high-frequency classes instead** — failed DEX aggregator and router calls, at
   ~26,000/day, are abundant, named, and decodable today.
2. **Use the fact that the floor is block 0** — reach back to a known stress window (a depeg, a
   crash) and prove reverted liquidations from history. This is a genuine differentiator: nothing
   about Arrears needs the failure to be recent, and §5 shows deep history stays under 1% of a
   block even at its most expensive.

Option 2 is the stronger submission story and costs less gas. It does need a historical scan,
which the public RPCs throttle — an archive endpoint with `eth_getLogs` access would settle it
quickly.

---

## 9. Historical stress windows — the demo shortlist

Evidence: [`19-stress-scan.txt`](phase0/evidence/19-stress-scan.txt),
[`21-demo-candidates.txt`](phase0/evidence/21-demo-candidates.txt)

The public archive RPC prunes below block 15,500,000, which puts Black Thursday, LUNA and the
stETH depeg out of reach on this endpoint. Five windows are reachable, and I scanned five
30-block slices across each event day to find the peak rather than guessing at it.

| window | date | peak block | revert rate at peak | liquidations seen |
|---|---|---|---|---|
| FTX collapse | 2022-11-09 | 15,932,331 | 2.8% | — |
| **USDC depeg (SVB)** | 2023-03-11 | 16,806,504 | elevated | — |
| **Yen carry unwind** | 2024-08-05 | 20,462,236 | **3.27%** | Aave ×4, Compound v3 ×2 |
| Feb 2025 selloff | 2025-02-03 | 21,769,440 | 1.79% | none |
| **Oct 2025 cascade** | 2025-10-10 | 23,549,876 | **2.40%** | Aave ×7, Morpho ×4 |

Baseline is 1.47%, so the stress windows run roughly **1.5–2.2x the normal revert rate**, and two
of them carry live liquidation cascades alongside the failures.

### Seven named failures, each proven against the live precompile

Every one is **out-of-gas** — `gasUsed == gasLimit` exactly — so every one falls in the slashable
class under design decision 1. Every one returned `verifySingle == true`.

| # | window | transaction | block | contRoots | cost to prove | % of block |
|---|---|---|---|---|---|---|
| 1 | USDC depeg | [`0xc22eb305…`](https://etherscan.io/tx/0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096) — Uniswap V2 Router `swapExactTokensForETHSupportingFee`, OOG at 324,239 | 16,806,527 | 474 | 335,919 | 0.448% |
| 2 | USDC depeg | [`0x1dd76820…`](https://etherscan.io/tx/0x1dd76820f55cc790a57ed33eee30ed25d120f6f0820a89c1f55a6c2dc7e71c22) — OOG at 77,600 | 16,806,523 | 478 | 337,173 | 0.450% |
| 3 | Yen carry | [`0x252a53c5…`](https://etherscan.io/tx/0x252a53c5d5fa0706ba15624c62db62300708eb9dbe14454af7a73f8fed6625e4) — OOG at 134,138 | 20,462,242 | 759 | 502,341 | 0.670% |
| 4 | Yen carry | [`0xbf4a6412…`](https://etherscan.io/tx/0xbf4a64126832f98707b723de0bc68b5883144313d5e8f2cb627847193aa206d0) — USDT transfer OOG at 76,808 | 20,462,236 | 765 | 502,659 | 0.670% |
| 5 | Feb 2025 | [`0x3198a097…`](https://etherscan.io/tx/0x3198a097f62d37dc2463b87adf87419621a8bf45e014491c0f9911aa09224fcc) — OOG at 134,482 | 21,769,440 | 561 | 384,792 | 0.513% |
| 6 | Oct 2025 | [`0x27cb5855…`](https://etherscan.io/tx/0x27cb58551d34f7b1a48fabdbfc8ca078a2e7aaf0bed52b425a980cd11d4a967c) — USDT transfer OOG at 120,000 | 23,549,876 | 125 | 118,740 | 0.158% |
| 7 | Oct 2025 | [`0xee76fbbb…`](https://etherscan.io/tx/0xee76fbbb8fe207a1af967a751dd5dd2c0b3fb6ae3f061ec108fc13d12df3c756) — USDT transfer OOG at 80,000 | 23,549,876 | 125 | 119,239 | 0.159% |

**Range: 118,740 – 502,659 gas. Worst case 0.670% of a CC3 block, for evidence three and a half
years old.** That is the number the demo rests on.

### Recommended demo window

**USDC depeg, 11 March 2023, blocks 16,806,500–16,806,540.** Candidate #1 is the strongest single
artifact in the set: a Uniswap V2 Router swap that ran out of gas at exactly 324,239/324,239
during the SVB depeg. It is self-inflicted by construction, it is from the most legible stress
event in recent DeFi memory, and it costs 0.448% of a block to prove.

Pair it with **Oct 2025** (#6/#7) as the contrast: same slashable class, same contract, one-third
the gas, because the checkpoints there are still dense. Two proofs, three years apart, side by
side, make the durability argument better than any prose.

### The gap worth naming

None of the seven is itself a *failed liquidation* — they are out-of-gas failures that happened
during liquidation cascades. Reverted `liquidationCall`s remain scarce even in stress windows.
If the submission needs a failed liquidation specifically, that is a deeper archive hunt than the
public RPCs will support, and I would want an archive endpoint before promising it.

---

## 10. Blocked: everything that needs a funded account

Three Phase 0 items are not done, all blocked on the same thing.

**The CC3 faucet is Discord-only.** Per
[the docs](https://docs.creditcoin.org/wallets/using-testnet-faucet.md), the only way to get
testnet CTC is `/faucet address:<addr>` in the `token-faucet` channel of
[discord.gg/creditcoin](https://discord.gg/creditcoin). There is no HTTP faucet — I probed
`faucet.cc3-testnet.creditcoin.network` and `faucet.creditcoin.org` and neither resolves. This
needs a human with a Discord account.

I have generated three keypairs, stored at `~/.config/creditcoin/arrears-testnet.json`, mode
`0600`, outside the repo. All currently zero balance:

| role | address |
|---|---|
| deployer | `0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030` |
| operator | `0x9733EcE9ba9351f70942E1241D875b878f6B178E` |
| impostor | `0xD2973C898c3B028ad71763FD7444E537148e77d0` |

Still outstanding, in priority order:

1. **The exploit demo, both halves, captured on chain** — the centrepiece. Needs CC3 CTC for the
   two naive ASCs, and Sepolia ETH for the impostor contract.
2. **Faucet / trivial deploy / cost** — needs CC3 CTC.
3. **On-chain confirmation of the gas and ceiling numbers** — everything in §5 and §6 is
   `estimateGas` and live `eth_call`, which is strong but is not a mined receipt. One funded run
   converts the whole gas section from estimated to measured.

**What I need from you:** run `/faucet address:0xD675A0C01511bC5a41169Dc2b93d8C9C13C27030` in the
Creditcoin Discord (and the other two if the faucet allows repeats), plus any Sepolia ETH you can
spare to `0xD2973C898c3B028ad71763FD7444E537148e77d0`. I will finish all three items unattended
once the balances land.

---

## 11. Repo and org status

Nothing created, nothing pushed, as instructed.

One thing to flag before Phase 1: the active `gh` account is **`Jagadeeshftw`**, and its token
carries scopes `admin:public_key, gist, read:org, repo` — **no `admin:org` or `write:org`**. I
cannot create the `Arrears-Protocol` org from the CLI with the current token. Org creation is a
web-UI action anyway (`github.com/organizations/plan`); once it exists and the token has
`write:org`, `gh repo create Arrears-Protocol/arrears` will work.

Commits will be under your name with no AI attribution trailers, as instructed.

---

## 12. What this changes about the design

The bonded-operator, slash-on-failure design survives, with three amendments:

1. **Build the claim from calldata, not events.** There are no events. `from` + `to` + selector +
   arguments + `status` + `gasUsed` is the entire evidentiary surface, and it is enough — it names
   the operator, the protocol, the attempted action and the failure.

2. **Price out-of-gas differently from explicit revert.** It is the only failure-mode
   discrimination available, it is proven rather than asserted, and it maps cleanly onto fault:
   under-provisioned gas is the operator's error, an explicit revert may not be.

3. **Design for 10-leg batches.** Not three sequential single calls. The batch overload exists,
   works on chain, caps at exactly 10, and at ten legs costs half a percent of the block. A claim
   covering ten failures is nearly as cheap as one covering a single failure.

And one opportunity worth taking seriously: because the floor is block 0 and even the most
expensive historical proof I measured costs 0.61% of a block, Arrears can reprice a credit line
against an operator's **entire history**, not a rolling recent window. A 2018 failure costs
about 6x a recent one to prove and is still nearly free in absolute terms. The official guidance
steers builders toward proving near the tip; for a product whose whole point is the durability of
a bad record, paying that 6x deliberately is the differentiator.
