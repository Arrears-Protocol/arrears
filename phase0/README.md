# phase0

Investigation harness for the Arrears Phase 0 report. Probe scripts only — no application logic.

```bash
npm install
npx tsx probes/04-kill.ts        # the kill question
npx tsx probes/08-batchlimit.ts  # the batch ceiling
```

Everything runs against public endpoints. Only the probes still to be written (the exploit
demos and the deploy-cost measurement) need a funded account; those read a key from
`~/.config/creditcoin/arrears-testnet.json`, never from this repository.

Findings: [`../Phase0-Report.md`](../Phase0-Report.md). Transcripts: [`evidence/`](evidence/).
