# Video shot list — revised

**3:00 target. Nothing shot yet — participants have not filed.**

Revised against what exists today rather than what was planned. Four things changed since the
first pass: the self-test exists and is worth a shot, a second operator is on the record, finding 3
became a public correction, and every ruling is now live on a domain a judge can open.

Two rules carried over from the site, and they matter more on camera than they do on a page:

- **Lead with a refusal, not the slash.** Anyone can build a thing that takes money. The claim
  worth making is that it refuses correctly, on chain, with a named error.
- **Three ruling classes are three distinct outcomes.** Never success/error. A refusal is the
  system working.

---

## Setup before the camera rolls

| | |
|---|---|
| ~~Re-freeze `demo/manifest.json`~~ | **No longer needed — fixed structurally.** The manifest carried a frozen `finalState` that had drifted to 18 / 2.0 / 750 / 650 bps / 1 strike against a chain reading 47.8 / 2.2 / 237.3 / 1250 bps / 5. It now carries no figures that can drift at all; the live panel is read on the server and revalidated. Figures marked *(live)* below are correct at shoot time by construction, but still read them off the screen rather than from this document. |
| Browser | Clean profile, no extensions bar, MetaMask pinned. Dark theme — the outcome cards were contrast-checked there. |
| Tabs pre-opened | `arrears.0xo.in`, Blockscout court page, Sepolia Etherscan. Never type a URL on camera. |
| Wallet | Controller `0xD675A0C0…`, funded. The operator picker will show two — that is intentional, see shot 8. |
| Terminal | Monospace, large. One command per shot, pre-typed in history. |

---

## The shots

### 1 · Cold open — the failure that costs nothing (0:00–0:18)

Etherscan, full screen, on a **reverted Ethereum mainnet transaction**:
`0x06ba12d8…` — a 1inch router call, block 25,916,354, status **Fail**.

> "This transaction failed on Ethereum mainnet. Somebody was relying on it. Nothing happened to
> whoever promised it would work."

Hold on the red **Fail** badge. No product, no logo yet.

### 2 · The exploit, half one (0:18–0:38)

Cut to Blockscout, CC3: `0xbd4eedc2…`, the acceptance transaction of
`NaiveSettlementASC` at `0x5e81f5A1…`.

> "Here is a cross-chain contract on Creditcoin accepting that failed transaction as a completed
> settlement. The proof is valid — the transaction really happened. It just didn't succeed, and
> nothing checked."

### 3 · The exploit, half two (0:38–0:52)

Sepolia Etherscan: impostor `0xfC7eAbb2…`, then CC3 `0x7d81c702…`.

> "Same shape, different lie. A throwaway contract emits a `Transfer` claiming a million USDC from
> Circle's treasury. A contract watching for that event credits it to the real token. The event
> signature matched. Nobody read the emitter."

**Both halves are on chain and clickable.** Say so.

### 4 · Title (0:52–0:58)

`arrears.0xo.in` hero, the fault line animating.

> "Arrears. A failed transaction, treated as evidence."

Let the fault line run three seconds. Point at the ratio: 660 : 10 : 1.

> "1.47% of mainnet transactions revert. A tenth of those run out of gas. That last column is the
> only one we'll touch."

### 5 · The refusal (0:58–1:22) — **the most important shot**

Dashboard → claim console. Pick the **ExplicitRevert** item, `0x9477726d…`. Preview first, free.

> "This one reverted, but it reverted deliberately — the contract said no and stopped. That is not
> a broken promise, it is a promise correctly declined."

Submit. Show the ruling `0xe585da11…` on Blockscout: **recorded, zero slashed.**

> "It goes on the operator's permanent record. Their bond is untouched. The system worked, and it
> worked by refusing."

### 6 · The other two refusals (1:22–1:44)

Two quick cuts, both mined, both named errors:

| ruling | error | what it proves |
|---|---|---|
| `0xd9f96284…` | `OutOfScope(Selector, 0xfFf9976…, 0x2e1a7d4d, 11646965)` | the bond answers for `deposit()`, not `withdraw()` |
| `0xc0bf98c0…` | `NotSlashableExplicitRevert(24187, 100000)` | strict mode records **nothing** rather than record-then-refuse |

> "Three different ways to be told no, each with a named error, each mined and readable by anyone."

### 7 · The slash (1:44–2:10)

Sepolia first: `0xe11a3557…`, WETH9 `deposit()`, **gasUsed 30,000 of gasLimit 30,000**.

> "This one ran out of gas. It needed 45,418 and was given 30,000."

Then the ruling `0xa7b1e50e…`: **OutOfGas, 2 tCTC slashed**, and the credit line repricing on
screen — limit down, premium up, strikes incremented. *(live — read the figures off the console at
shoot time, do not narrate them from here.)*

> "The bond moves, and the credit line reprices by a public rule anyone can evaluate. A pricing
> rule nobody can check is an oracle."

### 8 · The record, and two operators (2:10–2:24)

Operator console, wallet connected. The picker shows both.

> "Two operators registered here. This one carries a record of proven failures and has been
> slashed. *(live — say the actual count.)*
> This one has posted no bond and declared no coverage — so it answers for nothing, and the record
> says exactly that."

Do not skip past the empty one. It is the bond/coverage distinction demonstrated rather than
asserted.

### 9 · The self-test (2:24–2:42)

Terminal. `npm run all --url=https://arrears.0xo.in`. Let the PASS lines scroll.

> "Every write path is walked in a real browser by a real wallet — an EIP-1193 provider injected
> before the page scripts, real signatures, real transactions. It found four things that were live
> when it ran, including a connect button that didn't exist and a funding wall that hid a
> read-only record."

Cut to the JS-disabled pass: **25 checks, effective opacity 1.00 on all six sections.**

> "And the page carries its whole argument with JavaScript off."

### 10 · The correction (2:42–2:54)

`PROTOCOL-FINDINGS.md` finding 3, on the correction banner.

> "We published a finding saying a decoder function wasn't deployed. It was. A public Solidity
> library names struct parameters differently, so ethers, viem and web3 all compute a selector the
> chain doesn't dispatch — and it reverts with no data, which looks exactly like a missing
> function. Creditcoin asked us for our calldata, and that's how we found out."

> "The finding is better than the claim it replaces. It catches every builder who calls a library
> from off chain."

Then the line the whole shot exists for — **do not cut this one**:

> "We didn't find it by testing harder. We'd run the check, saved the transcript and cited it, so
> every time we looked, our own evidence agreed with us. It broke because somebody asked for our
> reproduction instead of our conclusion. That's why every finding we publish ships with the
> command that produces it."

**Say all of this plainly and do not rush it.** Being corrected in public and taking it cleanly is
the shot that makes the other nine credible — and a project that shows its own retraction on
camera is making a claim about how it works that nothing else in the video can make.

### 11 · Close (2:54–3:00)

Landing page, the trust-assumption section.

> "One thing here isn't proven by the precompile: that an address on the source chain belongs to
> the operator who bonded. We say so on the page, in the limitations, not buried in a comment."

Cut to black on the URL.

---

## Blocked on participants

Do not shoot these until claims have been filed by someone who isn't us. They are the difference
between a demo and a system, so leave the slots:

- **A claim filed by a third party**, from their wallet, crediting their own beneficiary. Shot 7
  currently uses our own controller; a stranger's transaction is strictly better and needs no
  script change.
- **A refusal earned by someone else's mistake** — an out-of-scope claim filed in good faith. More
  persuasive than one we constructed.
- **The record showing more than one claimant address.** One line in shot 8.

If nobody files in time, shots 5–8 stand as written. They are all real rulings on a public chain;
they are simply all ours.

---

## Cut if long

In order: shot 3 (half two), then shot 6's second row, then shot 11's second sentence. Never cut
shot 5, shot 10, or the reproduction line inside shot 10.
