# Arrears

**A Creditcoin contract that treats a failed Ethereum mainnet transaction as admissible evidence
against a bonded operator — slashing the bond and repricing a credit line.**

Built for BUIDL CTC 2026 Fall on the Creditcoin Attestcoin Protocol.

---

## A contract that accepted a forgery, and said so in the same breath

This is the sharpest thing in the repository. It is a real transaction on Creditcoin CC3, and you
can read it right now:

> ### [`0x7d81c702…c56947`](https://creditcoin-testnet.blockscout.com/tx/0x7d81c7023aa1b0a6b820670332603489d94a9dc9591bcdbee12e4797d7c56947)
>
> An Attestcoin Smart Contract that believed it was watching real Sepolia USDC accepted a
> **forged `Transfer` event claiming 1,000,000 USDC from Circle's treasury** — emitted by a
> 279-byte [throwaway contract on Sepolia](https://sepolia.etherscan.io/address/0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8)
> that implements no token and holds no balance.
>
> The event it emitted while accepting:
>
> ```
> TransferAccepted(
>   emitter            = 0xfC7eAbb2…CacB8   ← the impostor
>   from               = 0x55FE002a…44B8    ← Circle's treasury, forged
>   amount             = 1,000,000 USDC
>   emitterWasExpected = false              ← it KNEW
> )
> ```
>
> **`emitterWasExpected: false`, in the very event that accepted the forgery.** The contract had
> the mismatch in hand and acted anyway, because nothing in its logic consulted it.

Attestcoin did nothing wrong here. The proof is sound — that Sepolia transaction really happened
and really emitted that log. What fails is the **inference a consuming contract drew from a
correct proof**, and the fix is one comparison. Both are shown side by side in
[`NaiveEventASC.sol`](contracts/src/NaiveEventASC.sol).

### Check it yourself in thirty seconds

No key, no funding, no `.env`, no build step. It re-reads everything live from CC3, Sepolia and
Ethereum mainnet:

```bash
cd demo && npm install && npm run verify
```

Full walkthrough of both halves: [`demo/README.md`](demo/README.md).

---

## The other half: a proven *failure* accepted as a success

[`0xbd4eedc2…393c52`](https://creditcoin-testnet.blockscout.com/tx/0xbd4eedc2bd216aa8dd848029d3da992510180cefc73d2794f063587d76393c52)
— a naive ASC recorded a **reverted** 1inch v6 router transaction
([mainnet, `status 0x0`](https://etherscan.io/tx/0x06ba12d8eaf7527634e9739dc42b778cd2b60d9976901930233f6401e9042dd7))
as a genuine settlement. Its strict twin refuses the identical proof with
`SourceTransactionReverted(0, 386677, 598875)` — all three values decoded from the same proven
bytes the naive contract already had.

The block-prover precompile verifies **inclusion in a block**, which is not the same claim as
**the transaction having succeeded**. Nothing in the documented pattern mentions the difference.

---

## Seven real failures, and one real slash

[`demo/GALLERY.md`](demo/GALLERY.md) — `cd demo && npm run gallery`

Seven Ethereum mainnet failures spanning the 2023 USDC depeg to the 2025 cascade, each proven
against the live precompile and each classified **`OutOfGas`** by the deployed
[`VerdictProbe`](contracts/src/VerdictProbe.sol). Alongside them, a genuine Sepolia
[`WETH.deposit()`](https://sepolia.etherscan.io/tx/0xe11a3557f5e32c939f05c6d752036131cde5ed498520887b36b9f68676bbbf12)
that needed 45,418 gas and was sent 30,000.

**Both run the identical verification path** — the probe classifies with
[`ArrearsVerdict`](contracts/src/ArrearsVerdict.sol), the same library the court uses to rule. The
gallery shows the classification is right against real failures at real scale; Sepolia shows the
slash it leads to, end to end. No bond attaches to the mainnet seven because nobody here holds
those keys — which is the identity binding working, not a gap in the demo.

---

## Why this project exists

If a failed transaction can be proven, then a bonded operator's failures become a credit record
that no one can edit. Phase 0 established that it can:

**A reverted Ethereum mainnet transaction verifies `true` against the live precompile on CC3, and
its `receiptStatus == 0` is readable on chain.** Nobody had done it; it is the entire premise.

Two findings then reshaped the design:

**A reverted transaction has no logs. Ever.** 813 of 813 measured had zero logs and an all-zero
bloom — a top-level revert rolls back the journal — and the attested encoding has no revert-reason
field. The documented Readability pattern is event-driven throughout, so **it cannot see failures
at all.** Arrears builds claims from calldata, gas and identity instead.

**`gasUsed >= gasLimit` is the fault line.** Reverting is normal — 1.47% of mainnet, ~26,000
transactions a day — so "reverted" cannot mean "failed a duty". Out-of-gas is unambiguously
self-inflicted: the sender chose the limit and nobody can race them into choosing it badly. That
is the only slashable class. Explicit reverts are recorded and never slashable.

---

## The structural property: the gallery and the court cannot disagree

Most projects claim their demo path and their production path are the same. Here it is enforced
by the build, and the reason is worth stating precisely because a reader will not infer it from
the file layout.

**The classification rule exists exactly once, in
[`ArrearsVerdict.classify`](contracts/src/ArrearsVerdict.sol).** It is an `internal` function in a
library with no storage and no external interface:

```solidity
function classify(uint8 receiptStatus, uint64 gasUsed, uint64 gasLimit)
    internal pure returns (ArrearsTypes.Verdict)
{
    if (receiptStatus == 1) return ArrearsTypes.Verdict.Succeeded;
    return gasUsed >= gasLimit ? ArrearsTypes.Verdict.OutOfGas : ArrearsTypes.Verdict.ExplicitRevert;
}
```

Two contracts call it:

- [`ArrearsCourt`](contracts/src/ArrearsCourt.sol) — reaches the ruling that moves the bond
- [`VerdictProbe`](contracts/src/VerdictProbe.sol) — the public, view-only classifier the evidence
  gallery reads

Because `classify` is `internal`, the Solidity compiler **inlines it into each contract's
bytecode at compile time.** There is no delegatecall, no shared deployed library, no address
either contract could be pointed at something else. Both contracts literally contain the same
compiled instructions.

**The property that follows:** a change to the rule that made the gallery say one thing and the
court another is not merely discouraged, it is *not expressible*. There is one definition; editing
it recompiles both. A demo that showed a friendlier classification than production would require
deleting the library and writing the rule twice, which would be visible in a diff.

This matters because the two surfaces carry different halves of the argument — the mainnet gallery
proves the classification is right against seven real failures across three years, and the Sepolia
slash proves the ruling those classifications lead to actually lands. Splitting a claim across two
surfaces is only honest if the surfaces cannot drift. This is why they cannot.

The seven were also **re-classified through the deployed probe** rather than carried forward from
the Phase 0 transcript, since they were first classified before `Verdict` existed and before the
slashable class was narrowed. All seven survived unchanged, and
[`probes/29-reclassify.ts`](phase0/probes/29-reclassify.ts) exits non-zero if that ever stops being
true.

---

## One rule this site is built on

**Gate the button, never the explanation.** Every explanatory surface renders for
everyone — no wallet, no account, no JavaScript. Only actions that send a
transaction require anything, and they say so on a visible, disabled control
rather than by hiding the screen.

That rule exists because it was broken three times: sections rendered invisible
without JavaScript while every assertion passed, the registration wizard — the
screen written to explain the one thing the precompile does not verify — was put
behind a wallet gate, and the test suite checked whether text was in the DOM
rather than whether a reader could see it. All three are written up in
[`docs/principles.md`](docs/principles.md), and the no-JS suite now asserts
effective rendered opacity so the class cannot go green again.

---

## Limitations, and the one thing we take on trust

Arrears' pitch is that it takes nobody's word for anything. That is nearly true, and the exception
should be named here rather than discovered in a code comment.

### The identity binding is a signature, not a proof

**This is the only thing in the system the precompile does not verify.**

Everything else is proven. That a transaction was included, that it reverted, what it called, how
much gas it burned — all of it comes out of bytes the block-prover precompile verified, and none
of it requires trusting anyone. But the bond lives on Creditcoin while the evidence names an
*Ethereum* address, and **nothing in an Attestcoin proof connects those two identities.**

So the registry closes the gap with an EIP-191 signature: the source-chain key signs a digest
binding it to its Creditcoin controller, and `ecrecover` checks it. Sound in practice — an
operator gains nothing by binding an address they do not control, since it only creates liability
they could otherwise avoid — but it is a different *kind* of claim from everything around it. A
compromised source-chain key means a wrongly attributable bond, and no amount of proving would
catch it.

An alternative exists and was considered: have the operator send a marker transaction on the
source chain and prove it through Attestcoin itself, closing the loop with no signature scheme at
all. It costs the operator real mainnet gas and a round-trip through attestation before they can
register, so it is not the default — but it would remove the exception entirely, and it is the
obvious upgrade if this ever matters.

### Other limitations

- **No claimant reward, deliberately.** A bounty would make `beneficiary` a value the submitting
  relayer could redirect, turning every sponsored submission into value for whoever pays the gas.
  So the claimant's reward is the slash landing where it belongs, and nothing more. That is a real
  weakness of unrewarded fraud proofs: nobody is paid to go looking. Pricing a bounty without
  creating a redirection vector is a later extension, not an oversight.
- **Explicit reverts are never slashable.** Only `gasUsed >= gasLimit` is. An operator who fails
  by any other means is recorded and not punished, which is deliberate — see above — but it does
  mean a sufficiently careful operator can fail without consequence by always over-provisioning
  gas.
- **Testnet, unaudited.** The bond is play money until it is not.
- **One relayer key.** Concurrent sponsored submissions will collide on nonces until the relayer
  runs a queue or a key pool. Operational, not contractual — noted in
  [`docs/claim-submission.md`](docs/claim-submission.md).

## Layout

| path | what it is |
|---|---|
| [`docs/video-shotlist.md`](docs/video-shotlist.md) | the submission video, shot by shot |
| [`selftest/`](selftest/) | walks every write path in a real browser with a real wallet, as a first-time user |
| [`demo/`](demo/) | the demo surface — both exploit halves, the evidence gallery and the slash, verifiable with one command |
| [`demo/manifest.json`](demo/manifest.json) | single source of truth for the demo and the frontend: hashes and addresses, no fixtures |
| [`demo/GALLERY.md`](demo/GALLERY.md) | seven real mainnet failures, 2023–2025, plus the live Sepolia slash |
| [`contracts/src/`](contracts/src/) | the protocol — registry, court, credit line — and the demo contracts |
| [`contracts/test/`](contracts/test/) | 31 tests, including the revocation and coverage-selection boundaries |
| [`docs/claim-submission.md`](docs/claim-submission.md) | how a judge triggers a real ruling with sponsored gas |
| [`docs/principles.md`](docs/principles.md) | engineering rules that earned their place — read before changing the site |
| [`Phase0-Report.md`](Phase0-Report.md) | every finding, with the evidence that settled it |
| [`PROTOCOL-FINDINGS.md`](PROTOCOL-FINDINGS.md) | measured protocol facts, written to be posted publicly |
| [`phase0/evidence/`](phase0/evidence/) | raw transcripts of every live run |
| [`phase0/probes/`](phase0/probes/) | the scripts that produced them |

## Deployed

| what | where |
|---|---|
| `NaiveSettlementASC` | [`0x5e81f5A1…5d1a2`](https://creditcoin-testnet.blockscout.com/address/0x5e81f5A15a389F9CeAd6fCCE9B2f60035415d1a2) · CC3 testnet |
| `NaiveEventASC` | [`0x7DC1Cc8A…f4DB2`](https://creditcoin-testnet.blockscout.com/address/0x7DC1Cc8A209dB75c05717cb80827dBb66Eff4DB2) · CC3 testnet |
| `Impostor` | [`0xfC7eAbb2…CacB8`](https://sepolia.etherscan.io/address/0xfC7eAbb288ca94c8c2E4001696405852f07CAcB8) · Ethereum Sepolia |

## Reproducing the investigation

```bash
cd phase0 && npm install
npx tsx probes/04-kill.ts          # a reverted mainnet tx, verified on the live precompile
npx tsx probes/08-batchlimit.ts    # the batch ceiling — exactly 10 legs
npx tsx probes/14-selectors.ts     # which decoder functions are actually deployed
```

Those three need no funded account. Credentials for the on-chain probes are read from
`~/.config/creditcoin/arrears-testnet.json` and never from this repository.

## License

MIT
