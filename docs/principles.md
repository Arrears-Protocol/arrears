# Engineering rules that earned their place

Short list. Everything here exists because it was violated first and the violation
reached production or came close.

---

## 1. Gate the button, never the explanation

**Anything explanatory renders for everyone. Only actions require anything.**

This class of failure has surfaced three times, each in a different disguise:

| | what happened | how it looked |
|---|---|---|
| **Sections invisible without JS** | The redesign wrapped every section in a scroll-reveal whose `initial={{ opacity: 0 }}` serialised into the server HTML. A reader without JavaScript got a complete DOM at zero opacity. | A blank page, with all 19 assertions green |
| **The wizard behind the wallet gate** | The registration screen — written specifically to explain the one thing the precompile does not verify — was wrapped in `NeedsWallet`. | The argument hidden from exactly the reader it was written for |
| **The verifier's own hole** | The assertions checked whether text was *present in the HTML*, never whether it was *visible*. | Green tests over a broken page |

The rule that covers all three:

- **Explanation renders unconditionally.** Prose, diagrams, digests, computed
  previews, records, anything that only reads. No wallet, no JavaScript, no
  account, no connection.
- **Only the button is gated.** `NeedsWallet` wraps a submit control, never a
  section. A disabled button that says *why* it is disabled is correct; a hidden
  section is not.
- **A gate must be visible as a gate.** "connect a wallet to sign" on a disabled
  button teaches. A missing panel teaches nothing.

Practically, on this codebase: `Reveal` is CSS gated on `html.js`, set by an
inline script before first paint, so without JavaScript nothing is ever hidden.
`RegisterWizard` computes and displays its digest with nothing connected and
gates only `sign` and `submit`.

## 2. Assert what a reader sees, not what the DOM contains

Presence in the HTML is not the claim being made. `phase0/verify/nojs.ts`
therefore checks **effective rendered opacity through the whole ancestor chain**
for every section, with JavaScript disabled, alongside the content assertions.

If a test can pass on a blank page, it is testing the wrong thing.

## 3. Two measures, on purpose

`Container` has `size="doc"` (a reading measure, `max-w-6xl`) and `size="wide"`
(a console measure). The landing page is a document; prose past ~75 characters
gets harder to read. The dashboard is a working surface and should use the
screen. A narrow document beside a wide console is correct, not an inconsistency.

## 4. Never read a failed transaction's revert reason on chain

`pallet-evm` does not propagate precompile revert reasons on a mined transaction.
Our own out-of-scope ruling returned no revert data at all, while the identical
call over `eth_call` returned it in full. Refusal reasons come from
`previewClaim`, always. See finding 2 in [`../PROTOCOL-FINDINGS.md`](../PROTOCOL-FINDINGS.md).

## 5. Sample arbitrary heights when benchmarking Attestcoin

Round block numbers land exactly on attestation checkpoints, collapsing the
continuity proof to a single root and erasing the cost curve. Sampling them once
produced a result that flatly contradicted Creditcoin's published gas guidance —
the guidance was right. Use 12,345,678, never 12,000,000.

## 6. Say which number is measured and which is derived

Every gas figure on this project is either a mined receipt or an `estimateGas`
validated against mined receipts (0.03–7.56% over, never under). Where a figure
is a fit rather than a reading, the sample size is stated. A composite figure —
a whole contract transaction divided by the number of precompile calls inside it —
is not a per-call cost, and calling it one is how the 364k gas myth started.
