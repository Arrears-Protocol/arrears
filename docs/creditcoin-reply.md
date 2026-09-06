Thanks — the selector suggestion was the right thread to pull, and it turns out **we were wrong**. Both overloads are deployed and both work. Details so you can check.

**What we were decoding**

- Target chain: Ethereum mainnet, chain key `3`
- Tx: `0x77e7a60b4c1b02970ed9f09cceb7211b52a2a2d33061aa3319be90997af45a7f` (block 25,916,354)
- Decoder: `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f` — same address you gave and the same one on the chains/environments page, so no discrepancy there
- Flow: `getProof` → `decodeReceiptFields(txBytes)` → `getLogsByEventSignature(receipt, Transfer)`

**What was actually wrong**

`EvmV1Decoder` is a `library`, and a public library function refers to a struct parameter by its canonical name instead of expanding it to a tuple. So the selector isn't the one derived from the ABI JSON:

| overload | derived from `evmV1DecoderAbi.json` | what the library dispatches |
|---|---|---|
| `(LogEntry[], bytes32)` | `0xe6c11b43` ✗ | `0x07648c7a` ✓ |
| `(ReceiptFields, bytes32)` | `0x2414a709` ✗ | `0x54014825` ✓ |

We built calldata from the shipped ABI through ethers, got `0xe6c11b43`/`0x2414a709`, and both revert with empty return data — which surfaces as `require(false)`, indistinguishable from a function that isn't there. We read it as "not deployed". That was our mistake, not yours.

With the right selector it works. Filtering one USDC `Transfer` log, live on CC3 testnet:

```bash
curl -s https://rpc.cc3-testnet.creditcoin.network -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f","data":"0x07648c7a0000000000000000000000000000000000000000000000000000000000000040ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef00000000000000000000000000000000000000000000000000000000000000012a00000000000000000000000000000000000000000000000000000000000000"},"latest"]}'
```

Returns the log. Change the leading `0x07648c7a` to `0xe6c11b43` and the same call reverts with `0x`.

On the real transaction above, `0x54014825` returns 5 `Transfer` logs from 3 emitters as expected.

One suggestion, if it's useful: nothing next to the shipped ABI indicates it can't be used to derive calldata for those two functions, and the empty revert leaves nothing to search for. A note in the SDK docs, or a helper that emits the calldata, would have saved us the wrong conclusion.

Sorry for the noise, and thanks for the pointer.
