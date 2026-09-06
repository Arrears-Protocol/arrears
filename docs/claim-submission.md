# Claim submission and relayer sponsorship

A design note, written before any UI exists, so the contract is shaped for the demo rather than
retrofitted to it.

**The goal:** a judge with no wallet, no CTC and no setup opens a page, clicks once, and a real
proof is generated and a real ruling is mined on Creditcoin, with our relayer paying the gas.

---

## The good news: this needs almost nothing from the contract

Meta-transaction machinery — EIP-2771 forwarders, ERC-4337, permit-style signatures — exists to
let one account act **with another account's authority**. Filing a claim borrows no authority
from anyone. A claim is a fraud proof: its validity comes entirely from the Attestcoin proof, and
not at all from who carried it to the chain.

So `submitClaim` is permissionless, the relayer is simply `msg.sender`, and there is nothing to
forward. **We should explicitly not build a trusted forwarder.** It would add a trusted component,
a signature scheme and a replay nonce to buy a property we already have for free.

Two things are genuinely required, and both are already in
[`IArrearsCourt`](../contracts/src/interfaces/IArrearsCourt.sol):

### 1. `beneficiary` separated from `msg.sender`

```solidity
function submitClaim(..., address beneficiary) external returns (...);
```

The relayer pays; the judge is credited. Without this the judge's action is invisible on chain and
the demo is just our relayer talking to itself.

**Open decision:** if a claimant reward is ever attached, `beneficiary` becomes a value the
submitter can redirect. Keeping the reward non-monetary — a name on a ruling, not a payout — keeps
this safe with no extra machinery. Recommend that until there is a reason not to.

### 2. `previewClaim` as a free `view`

This is what makes sponsorship economically safe. The relayer runs the full adjudication over
`eth_call` for zero gas, learns the exact verdict, and only pays for claims that will land.

It depends on the precompile's **`verify` view overload** — which the SDK's vendored
`INativeQueryVerifier` omits entirely, and which is easy to miss. Phase 0 found it against the
live chain. Without it there is no free dry run and every malformed submission costs real money.

---

## Griefing, and where to bound it

Permissionless plus sponsored gas is a drain vector. The contract-side levers:

| vector | bound |
|---|---|
| Same claim submitted repeatedly | Claim ids are deterministic in `(chainKey, height, txIndex)`. A duplicate hits `AlreadyClaimed` before any expensive work. |
| Out-of-scope junk | `previewClaim` catches it off chain for free. On chain it refuses with `OutOfScope` naming the axis. |
| Well-formed but unprovable proofs | Caught by `previewClaim`. The relayer never submits them. |
| Volume | Belongs in the relayer service — rate limit per IP or per session — **not in the contract**. |

That last row matters. A contract-side allowlist would make the court permissioned and destroy the
property that makes it a fraud proof: anyone can bring evidence. Keep the throttle in the service,
where it can be tuned without a redeploy and where it does not weaken the guarantee.

### One real griefing vector worth deciding on now

Claim ids are global, not per-coverage — correct, since one failure should be claimable once. But
if an operator holds **two overlapping coverages** and one has a small `perClaimCap`, a griefer
could file the claim against the *weak* coverage first, consuming the claim id and capping the
slash far below what the strong coverage would have paid.

Three ways out, in order of preference:

1. **Deterministic coverage selection** — the court picks the covering coverage itself (say, the
   one with the largest `perClaimCap`) rather than trusting the submitter's `coverageId`. Removes
   the choice, removes the attack.
2. **Re-adjudication** — allow an already-ruled claim to be re-filed against a broader coverage,
   slashing only the difference.
3. **Forbid overlap** at declaration time.

Option 1 is cleanest and costs one extra lookup. It changes `submitClaim`'s signature — the
submitter would supply `operatorId`, not `coverageId` — so it should be settled **before**
implementation, not after.

---

## Cost: not a constraint

Measured, from mined receipts:

| | gas | at 0.5 gwei |
|---|---|---|
| Recent proof, full ASC call incl. verification | 273,896 | 0.000137 tCTC |
| Three-and-a-half-year-old proof (2023 USDC depeg) | 312,376 | 0.000156 tCTC |
| Worst historical case measured (2024, 765 continuity roots) | 474,064 | 0.000237 tCTC |

A single 10,000 tCTC faucet grant sponsors **roughly 40 million claims**. Sponsorship is free in
practice; the relayer's constraints are operational, not financial.

Proof calldata runs 2.5–27 KB, well inside the ~523 KB the public RPC accepts before returning
HTTP 413.

---

## The architecture that follows

```
browser  ──{ coverageId | operatorId, sourceTxHash, beneficiary }──▶  relayer service
                                                                        │
                                                    1. fetch proof from the Creditcoin prover
                                                    2. previewClaim over eth_call   (free)
                                                    3. if it will land, sign and submit
                                                        │
                                                        ▼
                                                    CC3: verifyAndEmit → ruling → event
                                                        │
browser  ◀────────── tx hash, Blockscout link ──────────┘
```

The browser never touches the prover, never assembles a proof, never holds a key and never signs.
It sends two identifiers and receives a transaction hash. That keeps the frontend thin, avoids
CORS against the prover, and avoids shipping 27 KB of proof through a wallet.

**Operational note, not contractual:** one relayer key serving concurrent judges will collide on
nonces. Either serialise submissions through a queue or run a small pool of relayer keys. Worth
settling early — it is the most likely thing to break during a live demo.

---

## The live slash runs on Sepolia, and that is the honest thing to demonstrate

Arrears is honest about who it can slash. The registry proves that a Creditcoin controller owns
the source-chain address its bond answers for, by signature — so **you cannot bond an operator
whose keys you do not hold.** That is the whole point of the identity binding, and it applies to
us exactly as it applies to anyone else.

So the demo has two surfaces, and each says something the other cannot:

**Live, on Sepolia (chain key 1).** We hold the operator's key, so registration is honest, the
signature check stays on, and the bond genuinely answers for that address. The failure is real
and deliberately produced: a plain
[`WETH.deposit()`](https://sepolia.etherscan.io/tx/0xe11a3557f5e32c939f05c6d752036131cde5ed498520887b36b9f68676bbbf12)
that honestly needed 45,418 gas and was sent 30,000 — above the 21,064 intrinsic, below what the
SSTORE needs, so it enters the contract, starts real work and dies partway through.
`gasUsed == gasLimit == 30,000`, `receiptStatus 0`, zero logs. Not a contract built to burn gas;
an under-provisioned limit against real work, which is exactly how it happens in production when
someone hardcodes a stale number. Same artifact class as mainnet
[`0xc22eb305…`](https://etherscan.io/tx/0xc22eb305d884a45228068337df490470661882e5e0efb1ff901b93fd192a8096),
on a chain where we hold the key.

**Historical, on Ethereum mainnet.** Seven real failures spanning the 2023 USDC depeg through the
2025 cascade, each verified against the live precompile, each in the slashable class. No bond can
honestly attach to them, because we do not own those keys — so they stand as a **read-only gallery
of what the protocol would have caught**, and nothing more.

Put together they demonstrate something neither half proves alone: **the identity binding is real
rather than assumed.** A system that could slash arbitrary mainnet addresses on demand would be
one that never checked who it was slashing. The fact that our own demo has to run on a chain where
we hold the key is the evidence that the check is load-bearing.

Weakening the registry to allow unproven mainnet registration would make the demo flashier and the
protocol dishonest. It is not on the table.

One operational number shapes the pacing: **Sepolia attestation lag is roughly 40 blocks, about
eight minutes.** A judge clicking "prove this failure" on a freshly produced transaction waits
that long. Either pre-produce the failure so it is already attested, or show the wait honestly
with a progress indicator — do not hide it behind a spinner that implies the system is slow.

---

## Decisions needed before implementation

1. **`coverageId` or `operatorId` in `submitClaim`?** Settled: `operatorId`, with the court
   applying the fixed selection rule documented on `IArrearsCourt.selectCoverage` — widest
   payable, ties to earliest declared, iterating an append-only array so order is fixed by
   history rather than by storage layout.
2. **Is there a claimant reward?** Settled: no. See the limitation recorded in the README.
3. **Sepolia for the live path.** Settled — see above.
