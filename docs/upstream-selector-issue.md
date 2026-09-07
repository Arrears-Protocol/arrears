# Upstream: ABI-derived selectors are wrong for public library functions

> ## ⛔ Do not file before 14 September 2026
>
> This belongs in issues on ethers, viem and web3.js — **after** the BUIDL CTC submission closes on
> 13 September, and nowhere in the submission itself. Filing three upstream issues during judging
> turns a bug report into a visibility play, which is not what it is. Park it, then file it.

## What to file

Three issues, same substance, one per repo:

- `ethers-io/ethers.js`
- `wevm/viem`
- `web3/web3.js`

## The report

**Selector computation ignores `internalType`, producing wrong selectors for public library
functions that take structs.**

Solidity computes the external signature of a public **library** function differently from a
contract's: a struct parameter is referred to by its canonical name, not expanded to a tuple. The
ABI JSON records this in `internalType`, but selector derivation reads `type` and discards it.

Reproduce with any deployed Solidity library. A live one:
`EvmV1Decoder` at `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f` on Creditcoin CC3 testnet
(`https://rpc.cc3-testnet.creditcoin.network`, chainId 102031).

```
ABI entry:  name "getLogsByEventSignature"
            inputs[0].type          "tuple[]"
            inputs[0].internalType  "struct EvmV1Decoder.LogEntry[]"

solc 0.8.30 methodIdentifiers:  0x07648c7a   ← what the deployed library dispatches
ethers 6.17.0 / viem 2.56.3 / web3.js 4.16.0: 0xe6c11b43   ← what all three derive
```

Calling with `0xe6c11b43` reverts with **empty return data**, which surfaces as `require(false)` —
indistinguishable from a function that was never deployed. That is the part worth fixing even if
the selector is not: the failure is silent and points the developer at the wrong conclusion.

Two independent teams reading the same ABI concluded the function was undeployed. It was not.

**Suggested fix:** when an input carries `internalType` of the form `struct Lib.Name`, and the ABI
belongs to a library, derive the signature from the canonical name. Failing that, a documented
warning where selectors are computed.

## Evidence to link

- `phase0/probes/44-toolchain.ts` · `phase0/evidence/44-toolchain.txt` — all three libraries against solc
- `phase0/probes/39-getlogs-call.ts` · `phase0/evidence/39-getlogs-call.txt` — both selectors, live eth_call
- `phase0/probes/42-selectors-library.ts` — full 16-of-16 scan

Reproduction in one paste is in [`creditcoin-reply.md`](creditcoin-reply.md).
