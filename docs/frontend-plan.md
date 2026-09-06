# Frontend plan

Written before any code. Layout, surfaces, and what each one reads from.

---

## Architecture: the read path has no backend

I tested this rather than assuming it. Both endpoints the site needs return `access-control-allow-origin: *`:

```
CC3 RPC     https://rpc.cc3-testnet.creditcoin.network      allow-origin: *   ✓
Prover      https://prover.cc3-testnet.creditcoin.network   allow-origin: *   ✓
```

So a browser can fetch a proof and call `previewClaim` **directly**, with no proxy, no API route
and no server. That settles the shape:

- **Everything read-only is a static site.** No wallet, no account, no connect button, no backend.
  A judge with a browser and nothing installed sees the entire argument.
- **One serverless function exists, for one reason:** the relayer holds a key, and keys cannot
  live in a static bundle. `POST /api/claim` is the only server-side code in the project.

If the relayer function is down, every surface except the interactive claim still works. The
argument does not depend on our infrastructure being up.

### The three live-call rules, enforced in one module

A single `chain.ts` is the only place that talks to a network, so the rules are structural rather
than a convention people remember:

1. **`eth_call` only.** It exposes `previewClaim`, `court.claim()`, `registry.operator()`,
   `payable_()` and `getCode()`. There is no code path in the read bundle that can send a
   transaction.
2. **Never read a failed transaction's revert reason on chain.** Our own out-of-scope transaction
   [`0xd9f96284…`](https://creditcoin-testnet.blockscout.com/tx/0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685)
   returned **no revert data** — `pallet-evm` drops precompile revert reasons on a mined
   transaction — while the same call over `eth_call` returned them in full. Refusal reasons are
   therefore always obtained by previewing, never by reading a receipt.
3. **Nothing waits on a chain.** Every artifact is already mined. No attestation polling, no
   spinner on a confirmation. Live calls are confirmations of already-true facts, so they render
   progressively: the page paints instantly from `manifest.json`, and each live check adds a
   `confirmed live` mark when it returns. A slow RPC degrades to a static page that is still
   completely readable, never to a loading state.

Everything reads from `demo/manifest.json` and nothing else.

---

## Layout

One page, six sections, in this order. The order is the argument.

### 1. Hero — a refusal

Opens on the out-of-scope refusal, not the slash. Any project can pay out; what shows the rule is
load-bearing is the system turning away a real failure it had every opportunity to punish.

Rendered as the five scope axes, four of which pass:

```
Ethereum Sepolia · block 11,646,965 · WETH.withdraw()
a real failure, by a bonded operator

  operator    0x9733EcE9…178E   bonded, 18 tCTC                    ✓ matches
  chain       Sepolia, key 1                                        ✓ matches
  window      11,646,000 – 11,700,000                               ✓ inside
  contract    0xfFf99767…6B14   WETH9                               ✓ covered
  selector    0x2e1a7d4d  withdraw(uint256)                         ✗ not in scope

  OutOfScope(Selector)
  Nothing was slashed. Nothing was recorded.
```

**Reads:** `manifest.rulings.outOfScope` for the static render; one live `previewClaim` to
reproduce `miss=Selector` in the browser and stamp it `confirmed live`. Deep links to the mined
CC3 transaction and to the Sepolia source.

The four passing axes are the point. This failure was as close to slashable as a failure can be
without being slashable.

### 2. The fault line

Short, static, no calls. Why `receiptStatus == 0` is not fault: reverting is ordinary at **1.47%
of mainnet, ~26,000 transactions a day**. Why `gasUsed >= gasLimit` is: the sender chose the limit
and nobody can race them into choosing it badly. **10.3%** of reverts.

**Reads:** nothing. Prose and two measured numbers from Phase 0.

### 3. The three outcomes

The four mined rulings, rendered as **three outcome classes, never as success and error.** A
refusal is the system working, and the visual language has to say so.

Each is rendered as *what changed in the ledger* — which makes them three distinct facts rather
than one good result and two failures:

| | Slashed | Recorded, not slashable | Refused |
|---|---|---|---|
| bond | −2.0 tCTC | unchanged | unchanged |
| treasury | +2.0 tCTC | unchanged | unchanged |
| credit limit | 1000 → 750 tCTC | unchanged | unchanged |
| premium | 500 → 650 bps | unchanged | unchanged |
| strikes | 0 → 1 | unchanged | unchanged |
| claims on record | +1 | **+1** | **0** |
| artifact | [`0xa7b1e50e…`](https://creditcoin-testnet.blockscout.com/tx/0xa7b1e50e66cff9d5c3e43fc9a6f3986e918b845756dc240c0fe1735b6c976be2) | [`0xe585da11…`](https://creditcoin-testnet.blockscout.com/tx/0xe585da11125f0ccbe147ce7ee96642d4e4e8cecd9b253a4d3a0362a3c5cda6c1) | [`0xd9f96284…`](https://creditcoin-testnet.blockscout.com/tx/0xd9f9628472e227ab97d52db043c9941af17308f3b2fd72d972ffd2c797a95685) · [`0xc0bf98c0…`](https://creditcoin-testnet.blockscout.com/tx/0xc0bf98c0231b2d059fd8a824c1c41f4cd224698cf159629582f64e2f7c4463c7) |

The `claims on record` row is where the middle column earns its place: **a recorded refusal costs
the operator nothing and still happened.** The right column's `0` is the strict path leaving no
trace, which `claim.ruledAt == 0` proves.

Three distinct treatments — a moved-ledger mark, a record mark, a turned-away mark. No green, no
red, no ✓/✗ between columns.

**Reads:** `manifest.rulings` for all four; live `court.claim(claimId).ruledAt` on the strict-path
evidence to show it is still `0`; live `registry.operator()` and `creditLine.terms()` for the
current bond and terms.

### 4. Try it — the one interactive thing

Relayer-sponsored, preview first, then submit, so prediction and result visibly match.

```
  1  pick a failure          from a pool of already-attested, unclaimed evidence
  2  choose what to ask      ( ) record it        ( ) slash only
  3  preview        free     eth_call → verdict, coverage, wouldSlash
  4  submit                  relayer pays, you are credited
  5  compare                 prediction beside result, and the Blockscout link
```

**Step 2 is a single choice made once, before anything is submitted.** That is how the ordering
constraint is enforced in the interface rather than documented next to it — see below.

**Step 3 is free and always runs first.** The preview is the same adjudication the court performs,
over `eth_call`. On the mined slash it predicted `OutOfGas / wouldSlash 2.0 tCTC` and the ruling
matched exactly; showing them side by side is the most convincing thing the page does.

**Reads:** the evidence pool from `manifest.evidencePool`; `previewClaim` live; then
`POST /api/claim` with `{sourceTx, shape, beneficiary}`. The relayer re-previews server-side and
refuses to spend gas on anything that would not land — the griefing bound from
[`claim-submission.md`](claim-submission.md).

Judges pick their own beneficiary address or leave it blank for a default. No wallet either way:
`beneficiary` is a string the relayer passes through, not a signer.

### 5. The gallery

Seven real Ethereum mainnet failures, 2023–2025, plus the Sepolia slash source. Each row: window,
source transaction, block, continuity roots, `gasUsed / gasLimit`, and the classification from
`VerdictProbe`.

**Reads:** `manifest.gallery.items` renders instantly; each row then verifies live in the
background — a proof fetch and one `previewClaim`-equivalent `VerdictProbe.read` — and marks
itself `confirmed live` as it lands. Seven rows verify in parallel; none of them blocks the page.

The framing beside it: **the gallery and the Sepolia slash run the identical verification path.**
`VerdictProbe` and `ArrearsCourt` both call `ArrearsVerdict.classify`, an `internal` function the
compiler inlines into each. The gallery shows the classification is right against real failures at
real scale; Sepolia shows the ruling it leads to. No bond attaches to the mainnet seven because
nobody here holds those keys — the identity binding working, not a gap.

### 6. What we take on trust, and what this is not

The identity binding is an EIP-191 signature, not a proof: the one thing the precompile does not
verify. Plus the attestation number as a measured fact — **41 blocks, about eight minutes,
broadcast to provable** — and why it costs the design nothing: Arrears cannot intercept a failure
and was never able to, but slashing a bond after a proven failure has no real-time requirement.
A settlement-time mechanism.

**Reads:** nothing. This section is prose and belongs on the page, not only in the repo.

---

## Enforcing the ordering constraint structurally

Recording consumes the globally unique claim id, so asking for the strict refusal *after*
recording returns `AlreadyClaimed` instead of the named error. We hit this ourselves. The
interface must make it unreachable, not merely warn about it:

1. **The shape is a radio, not two buttons.** One choice, made before submission. There is no
   sequence of clicks that submits both.
2. **Evidence state is checked before the choice is offered.** On selecting a failure the page
   calls `court.claim(claimIdOf(...)).ruledAt`. If it is non-zero the submission controls do not
   render at all — the existing ruling renders instead, with its Blockscout link.
3. **Consumed evidence leaves the pool.** After a successful submission that item is marked ruled
   and moves to a "already ruled" list, so a second judge cannot pick it and be told no.

The failure mode is designed out. A judge cannot reach `AlreadyClaimed` by clicking.

---

## Preflight: two things must happen before the UI is built

Both are consequences of what is already on chain, and neither is optional.

### The bond runs out after four more slashes

Measured just now:

```
bonded 18.0   committed 8.0   free 10.0
  coverage A  WETH.deposit()    committed 5.0  drawn 2.0  cap 2.0
  coverage B  WETH.transfer()   committed 5.0  drawn 0.0  cap 2.0
  remaining slashable: 8.0 tCTC at a 2.0 cap = 4 full claims
```

**Four interactive slashes and the demo is dead.** The fix is a dedicated demo coverage with a
small per-claim cap: top the bond up and declare **coverage C over `WETH.approve()`, committed
20 tCTC, perClaimCap 0.05** → **400 claims**. Sized so a judging period cannot exhaust it.

`approve()` because it must not collide with A or B, and because the court's selection rule takes
the *widest payable* — a 0.05 cap would lose to A's 2.0 on a shared selector, and the demo would
silently drain the real coverage instead. Verified it is genuinely under-provisionable: WETH
`approve()` honestly needs **46,434** gas against a 22,088 intrinsic, so a 30,000 limit sits
inside that window and produces a real out-of-gas failure. Same artifact class as everything else
here — real contract, real work, a limit set too low.

### The evidence pool must be pre-produced and pre-attested

Nothing may wait on attestation, so the interactive claim cannot produce a fresh failure on
demand — that is eight minutes with a judge watching. Instead, produce a pool up front:

- **30 out-of-gas** `WETH.approve()` failures → each slashes 0.05 tCTC
- **10 explicit-revert** `WETH.transfer()` failures → each records, refuses, costs nothing

Forty Sepolia transactions, about **0.0013 ETH** against the operator's 0.0299 ETH balance —
roughly 950 failures affordable, so the pool can be topped up freely. All attested before the
site goes live, all unclaimed, all listed in `manifest.evidencePool` with their claim state.

Offering both kinds matters: the interactive path should be able to demonstrate a **refusal** as
well as a slash. A judge who only ever sees the payout has seen half the rule.

---

## Deep links

Every hash on every surface links out. The contracts are source-verified, so Blockscout decodes
`ClaimRuled`, `SlashRefused` and `BondSlashed` itself and a judge can confirm the argument against
a source we do not control — which is the point of verifying them.

A single helper maps chain → explorer from `manifest.chains`, so nothing hardcodes a host:

| chain | explorer | what links there |
|---|---|---|
| CC3 | Blockscout | every ruling, every contract, the operator's bond |
| Sepolia | Etherscan | every source failure, the impostor |
| mainnet | Etherscan | the seven gallery failures |

---

## Deliberately absent

- **No connect button anywhere.** If the argument is behind a wallet, it is behind a door.
- **No spinners on chain state.** Progressive confirmation marks instead.
- **No success/error colouring on outcomes.** Three classes, three treatments.
- **No charts.** There is nothing here a chart explains better than a number.
- **No revert reasons read from receipts.** `eth_call` previews only.
- **No backend on the read path.** One function, for the relayer's key.

---

## Open questions

1. **Framework.** Next.js on Vercel is implied by the Website field being held for it. The read
   path is static either way; the only server need is `/api/claim`. Confirm Vercel.
2. **Pool exhaustion.** With 400 slashes and 30 pooled OOG failures, the pool binds first. When it
   empties the interactive section should degrade to showing the four existing rulings rather than
   erroring — confirm that is the wanted behaviour rather than topping the pool up mid-event.
3. **Beneficiary input.** Free-text address, or a default with an optional override? Free text is
   more convincing and risks a judge pasting something malformed; validation is trivial either way.
