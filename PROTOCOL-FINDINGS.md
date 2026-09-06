# Attestcoin protocol: measured findings

Independent measurement of the Attestcoin Protocol on Creditcoin CC3 testnet, September 2026.
Everything below was produced by running against the live network — the public CC3 RPC
(`https://rpc.cc3-testnet.creditcoin.network`, chain 102031), the block-prover precompile at
`0x…0FD2`, the deployed `EvmV1Decoder` at `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f`, the
hosted prover, and Ethereum mainnet.

Six findings. Two are things the documentation gets right and that deserve saying out loud, one
is a security note on the reference library, and three are gaps between what is documented or
shipped and what is actually deployed.

Versions under test: `@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.1.2`, CC3 testnet at block
~5,439,000, Ethereum mainnet attested tip ~25,916,390.

Reproduction scripts and raw transcripts are linked per finding. Findings 1–4 and 6 reproduce
with no funded account at all — they use `eth_call`, `estimateGas` and reads. Finding 5's mined
receipts need a funded testnet key; the same result is visible for free through `estimateGas`.

---

## 1. The published gas formula is accurate. Here it is in gas.

**Status: confirmed.** This one is a compliment, not a correction.

> ### ⚠️ If you benchmark this yourself, do not sample round block numbers
>
> Heights like 1,000,000 and 10,000,000 land **exactly on attestation checkpoints**, so their
> continuity proofs collapse to a single root and the entire cost curve disappears. Sampling
> them will tell you that deep history is *cheaper* to prove than recent history, which is the
> opposite of the truth.
>
> I made exactly that mistake on a first pass and produced a result that flatly contradicted the
> published guidance. The guidance was right. **Sample arbitrary heights** — 12,345,678, not
> 12,000,000 — and the measured curve matches the documented one closely. Everything in this
> finding is measured at non-aligned heights.

The [Gas Costs](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-readability/gas-costs.md)
page gives the cost of a readability query as:

> CTC Cost ≈ 2.3×10⁻⁵ + 2.9×10⁻⁷ × (continuity hash count)

At the CC3 testnet gas price of 0.5 gwei, that converts to **46,000 gas base + 580 gas per
continuity hash**.

Measuring it independently — fitting `estimateGas` for single `verifyAndEmit` calls across
fourteen mainnet heights from block 400,013 to the attested tip, with continuity proofs ranging
from 24 to 765 roots — gives **595 gas per continuity root**. That is **within 2.6% of the
published figure**, derived from a completely different direction.

The decomposition, for anyone who wants the mechanism rather than the fit:

| component | cost |
|---|---|
| intrinsic transaction | 21,000 |
| each continuity root — precompile hashing | ~83 gas |
| each continuity root — its 32 bytes of calldata | ~512 gas |
| **each continuity root, all in** | **~595 gas** |
| transaction bytes | ~13 gas/byte |

```
gas ≈ 21,000  +  ~13 × txBytes  +  ~595 × continuityRoots
```

The practical reading: **verification is calldata-bound, not compute-bound.** The precompile's own
execution for a typical single proof is around **18,000 gas**; transporting the proof is the rest
of the bill. Builders optimising this should be shortening proofs, not simplifying contract logic.

The documentation's advice to prove transactions soon after finalisation is also correct, and the
magnitude is right. Measured at arbitrary (non-checkpoint-aligned) heights:

| height | checkpoint spacing | continuity roots | total gas |
|---|---|---|---|
| 25,915,777 | 100 | 24 | 74,979 |
| 23,000,851 | 1000 | 150 | 162,430 |
| 15,555,555 | 1000 | 446 | 334,759 |
| 5,000,321 | 1000 | 680 | 456,026 |

Worth adding to that page: even at its worst, the penalty is bounded. The most expensive
historical proof I measured cost 456,026 gas — **0.61% of the 75,000,000 block gas cap**. Proving
old transactions is several times dearer than proving recent ones and still nearly free in
absolute terms.

---

## 2. `estimateGas` against the precompile is reliable, despite the known caveat

**Status: confirmed, with a useful qualification.**

The SDK's `utils/gas.ts` carries this warning, and it is a real phenomenon:

> Gas estimation can fail even when the call would succeed. This is a known issue with
> precompiles — `pallet-evm` doesn't always properly propagate revert reasons during estimation
> mode.

`computeGasLimit` therefore falls back to a continuity-length heuristic. Builders reading that
comment may reasonably conclude that estimation cannot be trusted at all. In practice it can:

- Across every valid proof tested — fourteen heights, batch sizes 1 through 10 — `estimateGas`
  against the precompile **succeeded every time**, including from a zero-balance account. The
  fallback never triggered. It failed only where the call genuinely would revert.
- Replaying nine mined CC3 transactions at their own parent block, `estimateGas` tracked actual
  `gasUsed` to within **0.03%–6.81%, and over-estimated in every case** — never under.

So the heuristic is a correct safety net, but estimation is a sound conservative upper bound on
CC3 today. Both facts are worth stating together; the comment alone reads more alarming than the
behaviour warrants.

---

## 3. `getLogsByEventSignature` ships in the SDK ABI but is not deployed

**Status: gap between the shipped ABI and the deployed bytecode.**

`@gluwa/usc-sdk/dist/utils/evmV1DecoderAbi.json` declares 16 functions for `EvmV1Decoder`. The
library deployed at `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f` on CC3 testnet — 9,598 bytes of
runtime bytecode — dispatches only **14** of them.

Both overloads of `getLogsByEventSignature` are absent:

| selector | signature | in deployed bytecode |
|---|---|---|
| `0xe6c11b43` | `getLogsByEventSignature((address,bytes32[],bytes)[],bytes32)` | **no** |
| `0x2414a709` | `getLogsByEventSignature((uint8,uint64,(address,bytes32[],bytes)[],bytes),bytes32)` | **no** |

The other 14 — `decodeReceiptFields`, `decodeCommonTxFields`, the five
`decodeTransactionTypeN`, the five `decodeTypeSpecificFieldsTypeN`, `getTransactionType`,
`isValidTransactionType` — are all present and work.

**The failure mode is unhelpful.** Calling either overload does not produce a "function not found"
error. It reverts with **no return data at all**, which ethers reports as
`require(false)`. A developer following the library's own documented usage pattern —
`getLogsByEventSignature` is one of only two helpers named in the `EvmV1Decoder` header comment —
gets a bare revert with nothing to search for.

Either the deployed library should be updated to match the shipped ABI, or the ABI should drop
the two functions and the header comment should stop recommending them.

Reproduce: `probes/14-selectors.ts` — reads the deployed bytecode and checks each ABI selector
against it.

---

## 4. `getLogsByEventSignature` matches on signature alone and never checks the emitter

**Status: security note on the reference implementation.**

This concerns the library *source*, which builders copy or link even where the deployed copy is
unavailable. From `contracts/decoding/EvmV1Decoder.sol`:

```solidity
function getLogsByEventSignature(LogEntry[] memory logs, bytes32 eventSignature)
    public pure returns (LogEntry[] memory)
{
    uint256 n;
    for (uint256 i; i < logs.length; i++) {
        if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSignature) n++;
    }
    LogEntry[] memory out_ = new LogEntry[](n);
    uint256 k;
    for (uint256 i; i < logs.length; i++) {
        if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSignature) out_[k++] = logs[i];
    }
    return out_;
}
```

The filter is `logs[i].topics[0] == eventSignature`. **`logs[i].address_` is never read.**

The function is behaving as named, and in isolation this is not a bug. The concern is how it
composes with the surrounding guidance. The
[Readability](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-readability.md) flow
describes the builder's job as detecting "the emission of events on the source chain which are
relevant to their dApp" and then "extracting the relevant event" from the proven transaction.
`getLogsByEventSignature` is the natural tool for that last step, and it is the one the library
recommends. A contract that proves a transaction, filters its logs by signature, and acts on the
result has verified that *some contract somewhere on the source chain* emitted that shape of
event — not that the contract it cares about did.

Anyone on the source chain can deploy a contract emitting `Transfer(address,address,uint256)`, or
any other signature, with arbitrary arguments. Attestcoin will faithfully prove that transaction,
because it really did happen. The proof is sound; the inference is not.

This is not theoretical. On CC3 testnet, a contract following exactly this pattern — proving a
transaction and matching a log by signature — accepted a forged `Transfer` event emitted by a
throwaway contract on Sepolia
([`0xfC7eAbb2…`](https://sepolia.etherscan.io/address/0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8))
claiming a transfer of 1,000,000 USDC from Circle's treasury address, and credited it to the real
Sepolia USDC contract it believed it was watching. The accepting transaction is
[`0x7d81c702…`](https://creditcoin-testnet.blockscout.com/tx/0x7d81c7023aa1b0a6b820670332603489d94a9dc9591bcdbee12e4797d7c56947).

Attestcoin did nothing wrong there. The proof is correct — that Sepolia transaction really
happened and really emitted that log. What fails is the inference the consuming contract drew
from a correct proof.

Two suggestions, both cheap:

1. Add an emitter-filtered overload —
   `getLogsByEventSignature(LogEntry[] memory, bytes32 eventSignature, address emitter)` — and
   make it the one the header comment recommends.
2. Have the
   [Source Chain Smart Contracts](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/source-chain-smart-contracts.md)
   best-practice page state the emitter check explicitly. The page already frames itself as the
   secure-querying pattern, which makes it the right home for it.

---

## 5. The block-prover precompile has five functions, including undocumented batch overloads with a hard cap of 10

**Status: undocumented surface and an undocumented limit.**

The precompile ABI shipped in `@gluwa/usc-sdk/src/block-prover/block_prover.json` declares one
event and **five** functions, all of which respond on CC3:

```
EVT  TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 txIndex)

FN   view        calculateTxIndex(MerkleProof) -> uint64
FN   view        verify(uint64, uint64,   bytes,   MerkleProof,   ContinuityProof) -> bool
FN   view        verify(uint64, uint64[], bytes[], MerkleProof[], ContinuityProof) -> bool
FN   nonpayable  verifyAndEmit(uint64, uint64,   bytes,   MerkleProof,   ContinuityProof) -> bool
FN   nonpayable  verifyAndEmit(uint64, uint64[], bytes[], MerkleProof[], ContinuityProof) -> bool
```

Two things here are easy to miss.

**The `view` overloads let a contract verify for free.** `verify` is read-only and reverts on a
bad proof, so a contract can validate a proof before committing gas to anything. The vendored
`INativeQueryVerifier` in `@gluwa/usc-contracts` exposes only single `verify`, and describes
itself as a "lean vendored copy" — so a builder working from that interface never sees the batch
forms at all.

**The batch overloads work on chain, and cap at exactly 10 legs.** Every row below is a mined
transaction sent from an EOA straight to the precompile; each successful one emitted exactly N
`TransactionVerified` events, confirming all N legs verified.

| N | calldata | mined gasUsed | % of MAX_GAS_CAP | events |
|---|---|---|---|---|
| 1 | 4,324 B | 77,256 | 0.103% | 1 |
| 5 | 14,180 B | 206,528 | 0.275% | 5 |
| 9 | 24,196 B | 346,780 | 0.462% | 9 |
| **10** | 25,220 B | **383,516** | **0.511%** | **10** |
| **11** | 29,444 B | **reverted** — `"heights: Value is too large for length"` | — | — |

N=11 was refused twice over: `estimateGas` rejected it, and a transaction sent anyway reverted on
chain. The cap is real, not an estimator artifact. Marginal mined cost is ~34,029 gas per
additional leg, so ten legs cost roughly five times one leg rather than ten times — the shared
continuity proof is carried once, which is the main reason to use the batch form.

Three observations:

- The cap is **10**, on both `verify` and `verifyAndEmit`. It looks like a bounded-vector
  constraint on the `heights` argument. It is not stated in the documentation I could find.
- It bites at **0.515% of `MAX_GAS_CAP`**. The limit has nothing to do with gas, so builders
  sizing batches against the 75,000,000 cap will size them ~200x too large and only discover the
  real bound at runtime.
- The error string, `"heights: Value is too large for length"`, describes a decode failure rather
  than a batch-size limit. Something like `"batch size exceeds maximum of 10"` would save
  people an afternoon.

All legs of a batch share **one** `ContinuityProof`, which is the main reason to use the batch
form: ten single calls carry ten copies of the same roots.

Reproduce: `probes/08-batchlimit.ts`.

---

## 6. Failed source-chain transactions are provable, and carry no logs

**Status: undocumented capability, with a consequence worth documenting.**

The documentation's model of readability is event-driven throughout — builders "listen for the
emission of events", request a proof of "the transaction containing the target event", and
"extract the relevant event". Nothing in it addresses transactions that *failed*.

They are fully supported, and this appears to be undocumented:

- The hosted prover generates proofs for transactions with `receiptStatus == 0` without
  complaint. Measured at 817 ms for a mainnet 1inch v6 router transaction that reverted.
- The precompile's `verify` returns `true` for them. It does not check success, by design.
- `EvmV1Decoder.decodeReceiptFields(txBytes).receiptStatus` reads back **`0`** on chain.
- `receiptGasUsed`, `from`, `to`, `nonce`, `gasLimit`, `value` and the full calldata all decode
  correctly and match mainnet byte-for-byte.

Worked example, reproducible with no funded account:
mainnet tx `0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7`, block
25,916,354, index 85, `status 0x0` → `verify` returns `true`, `calculateTxIndex` returns `85`,
`decodeReceiptFields` returns `receiptStatus = 0`, `receiptGasUsed = 386,677` matching mainnet.

**The consequence builders need to know: a failed transaction has no logs.** Not usually — ever.
A top-level revert rolls back the EVM journal, logs included. Across **813 reverted mainnet
transactions** in two independent scans (92 over 30 blocks, 721 over 200 blocks), every one had
zero logs and an all-zero bloom.

So the event-driven pattern the documentation teaches **cannot see failures at all**. Any dApp
that reasons about whether something on the source chain *did not work* has to read
`receiptStatus`, `receiptGasUsed` and calldata instead. That is a different design pattern from
every one currently documented, and it is well worth a page — the capability is already there and
working.

One further note, since the receipt struct is where this lives: `ReceiptFields` carries
`receiptStatus`, `receiptGasUsed`, `receiptLogs` and `receiptLogsBloom`, and **no revert reason**.
Revert return data is not part of the attested encoding, so the *fact* of failure is provable but
the *reason* is not recoverable. Documenting that boundary would set expectations correctly.

---

## Method and reproduction

Every finding above is reproducible against public endpoints with no funded account. The probes
are plain TypeScript over `ethers` v6 and the published SDK:

| finding | script | transcript |
|---|---|---|
| 1 — gas model | `probes/20-deep-history-honest.ts`, `probes/16-marginal.ts` | `evidence/20-deep-history-honest.txt` |
| 2 — estimator accuracy | `probes/17-estimator-trust.ts` | `evidence/17-estimator-trust.txt` |
| 3 — undeployed selectors | `probes/14-selectors.ts` | `evidence/14-selectors.txt` |
| 4 — emitter check | source reading; `probes/13b-impostor-real.ts` | `evidence/13b-impostor-real.txt` |
| 5 — batch cap | `probes/08-batchlimit.ts` | `evidence/08-batchlimit.txt` |
| 6 — failed transactions | `probes/04-kill.ts`, `probes/10-survey.ts` | `evidence/04-kill-reverted-1inch.txt` |

Where a figure could be backed by a mined receipt it is: the batch cap in finding 5, and the
15 single-leg proofs underlying finding 1's model, were all submitted as real transactions on CC3
testnet. Fitted constants are stated as fits, with their sample size. The remaining
`estimateGas` figures are validated as conservative upper bounds accurate to within 7.6%, per
finding 2 — across every case measured, estimation over-shot the receipt and never under-shot it.

Corrections to any of this are welcome — the scripts are the argument, not the prose.
