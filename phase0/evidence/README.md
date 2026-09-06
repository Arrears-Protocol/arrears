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
| `13b-impostor-real.txt` | `getLogsByEventSignature` reverts on the deployed library |
| `14-selectors.txt` | only 14 of 16 decoder ABI functions are actually deployed |
