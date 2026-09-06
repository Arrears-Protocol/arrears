# Phase 0 evidence

Raw transcripts. Every one is a live run against public endpoints
(CC3 testnet RPC, the Creditcoin prover, Ethereum mainnet RPC).
Regenerate any of them with `npx tsx probes/<name>.ts`.

| file | what it settles |
|---|---|
| `01-chaininfo.txt` | CC3 chainId 102031, live block gasLimit == MAX_GAS_CAP, chain key 3 -> chainId 1 |
| `02-floor.txt` | provable-history floor for chain key 3 (checkpoints at height 0) |
| `03-scan-reverts.txt` | 30-block revert scan: rate, and zero logs on every reverted tx |
| `04-kill-reverted-1inch.txt` | **THE KILL QUESTION** — reverted mainnet tx verified on the live precompile |
| `06-gasmodel.txt` | gas vs continuity length vs history depth |
| `07-ceiling.txt` | batch ceiling, large transactions |
| `08-batchlimit.txt` | exact batch cap (N=10) on both `verify` and `verifyAndEmit` |
| `09-txsize.txt` | gas is calldata-bound; gas model regression |
| `10-survey.txt` | 200-block mainnet failure survey |
| `11-413.txt` | public RPC request-body ceiling |
| `13b-impostor-real.txt` | `getLogsByEventSignature` reverts when called with the ABI-derived selector — **superseded**: the cause was library selector encoding, see `42-selectors-library.txt` |
| `14-selectors.txt` | **WRONG — superseded by `42-selectors-library.txt`.** Concluded 14 of 16 decoder functions were deployed. It derived every selector from the ABI JSON, which is the contract rule; `EvmV1Decoder` is a library. |
| `38-library-selectors.txt` | the same scan with candidate signatures: library-qualified struct names hit, tuple-expanded ones miss |
| `39-getlogs-call.txt` | both overloads called by explicit selector — ABI selector reverts with empty data, library selector returns |
| `40-emitter.txt` | the **deployed** filter returns a forged `Transfer` from `0x…DeaDBeef` alongside the real USDC one |
| `41-getlogs-endtoend.txt` | real mainnet tx `0x77e7a60b…` proven on CC3, receipt decoded, 5 Transfers from 3 emitters returned |
| `42-selectors-library.txt` | **16 of 16** decoder ABI functions are dispatchable |
