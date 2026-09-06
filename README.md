# Arrears

A Creditcoin contract that treats a failed Ethereum mainnet transaction as admissible evidence
against a bonded operator — slashing the bond and repricing a credit line.

Built for BUIDL CTC 2026 Fall, on the Creditcoin Attestcoin Protocol.

## Status: Phase 0 complete

Phase 0 was an investigation, not an implementation. It asked whether the premise is even
possible and what the evidence a failed transaction carries can actually support.

**It is possible.** A reverted Ethereum mainnet transaction verifies `true` against the live
block-prover precompile on CC3, and its `receiptStatus == 0` is readable on chain. Nobody had
done this before; it is the entire premise of the product.

| document | what it is |
|---|---|
| [`Phase0.md`](Phase0.md) | the original brief |
| [`Phase0-Report.md`](Phase0-Report.md) | findings, with the evidence that settled each one |
| [`PROTOCOL-FINDINGS.md`](PROTOCOL-FINDINGS.md) | measured protocol facts, written to be posted publicly |
| [`phase0/evidence/`](phase0/evidence/) | raw transcripts of every live run |
| [`phase0/probes/`](phase0/probes/) | the scripts that produced them |
| [`contracts/`](contracts/) | the exploit-demo contracts, deployed on CC3 and Sepolia |

## The two findings that shape the design

**A reverted transaction has no logs. Ever.** 813 of 813 reverted mainnet transactions carried
zero logs and an all-zero bloom — a top-level revert rolls back the journal. The whole documented
Readability pattern is event-driven, so it cannot see failures at all. Arrears must build its
claims from calldata, gas and identity.

**`gasUsed >= gasLimit` is the fault line.** Reverting is normal — 1.47% of mainnet, ~26,000
transactions a day — so "reverted" cannot mean "failed a duty". Out-of-gas is self-inflicted: the
sender chose the limit and nobody raced them into it. That is the slashable class. Explicit
reverts are recorded and never slashable.

## Reproducing

```bash
cd phase0 && npm install
npx tsx probes/04-kill.ts          # a reverted mainnet tx, verified on the live precompile
npx tsx probes/08-batchlimit.ts    # the batch ceiling
npx tsx probes/14-selectors.ts     # which decoder functions are actually deployed
```

No account needs funding for those three. Credentials for the on-chain probes are read from
`~/.config/creditcoin/arrears-testnet.json` and never from this repository.

## License

MIT
