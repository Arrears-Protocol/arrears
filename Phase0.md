Project name: Arrears. Repo Arrears-Protocol/arrears (create the org, don't push until Phase 0 reports). Package scope @arrears/*.

New project, fresh repo and session. Target: BUIDL CTC 2026 Fall, Creditcoin Attestcoin Protocol. Run this investigation and report with the evidence that settled each item. Write no application logic.

Read first, as reconnaissance, not to copy: https://github.com/edycutjong/index41 — its README, JUDGE.md, docs/PIPELINE.md and src/surfaces.ts contain the most complete map of the Attestcoin SDK that exists, including a 325-surface catalogue and a 36-row load-bearing table. Treat its factual claims about the protocol as leads to verify, not as given.

Established from that source, verify rather than rediscover: INativeQueryVerifier has exactly verifyAndEmit and calculateTxIndex; no on-chain batch verify; ~364k gas per verifyAndEmit against a 75,000,000 MAX_GAS_CAP; chainInfo.getAttestationGenesisHeight gives the provable-history floor; chain key 3 is Ethereum mainnet; pallet-evm drops precompile revert reasons during estimation so gas limits must be computed.

The design being validated: a Creditcoin contract that treats a failed Ethereum mainnet transaction as admissible evidence against a bonded operator, slashing the bond and repricing a credit line.

KILL QUESTION: can a reverted mainnet transaction be proven at all? Take a real mainnet transaction with receiptStatus == 0, generate a proof, and verify it against the live precompile on CC3. The docs say the precompile does not check success, so this should work, but nobody in the field has done it and it is the entire premise. Confirm the decoded receiptStatus is readable as 0 on chain via EvmV1Decoder.decodeReceiptFields.
Can we distinguish why it failed? Report what a reverted transaction's proven bytes actually carry: are there logs at all, is there a revert reason, is gasUsed present. This decides how expressive the evidence can be.
Run getAttestationGenesisHeight on CC3 and report the actual provable-history floor for chain key 3 in block numbers and calendar dates. This bounds how far back any record can reach.
The exploit demo, both halves. Write a naive ASC following the official example pattern and show it accepting a reverted mainnet transaction as valid. Then deploy an impostor contract on Sepolia emitting a common event signature and show a second naive ASC accepting it because it matches on signature without checking the emitter. Capture both on chain. These are the centrepiece of the submission.
Measure the ceiling: how many verifyAndEmit calls fit in one CC3 transaction under MAX_GAS_CAP in practice. Report the measured number, not the arithmetic one.
Get CC3 testnet CTC, deploy a trivial contract, report faucet, address, cost.
Survey mainnet for real failure events worth building on: reverted Aave liquidationCalls, failed settlement transactions, reverted keeper calls. Report roughly how frequent they are and which have clean, decodable evidence. The product needs real failures to point at, the way index41 needed a real sandwich.

Report before writing anything else. Commits under my name only, no AI attribution trailers.