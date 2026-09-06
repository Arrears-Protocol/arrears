# Deploying the site

## Connect Vercel through the dashboard, not the CLI

A CLI-created Vercel project has **no git link**, so pushes never deploy and `main` drifts ahead
of production silently. Connect it from the dashboard:

1. [vercel.com/new](https://vercel.com/new) → import **`Arrears-Protocol/arrears`**
2. **Root Directory:** `web`
3. Leave "Include source files outside of the Root Directory" **enabled** — `web/lib/manifest.ts`
   imports `../../demo/manifest.json`, which is the single source of truth and lives outside `web/`
4. Framework preset: Next.js (auto-detected). No build command override needed.
5. Environment variable, **Production and Preview**:
   `RELAYER_PRIVATE_KEY` = the CC3 relayer key from `~/.config/creditcoin/arrears-testnet.json`
   (`accounts.deployer.privateKey`). Nothing else is required; every other surface works without it.
6. Set the repository's Website field to the deployment URL once it exists.

## Verify a push actually deploys

The whole reason for the dashboard route is that a missing git link fails silently. So check it,
once, deliberately:

```bash
git commit --allow-empty -m "chore: verify deploy hook" && git push
# wait for the deployment, then:
curl -s https://<deployment>/api/version | jq
```

`/api/version` reports the commit the live build came from:

```json
{ "commit": "…", "commitShort": "abc1234", "branch": "main", "gitLinked": true, "relayerConfigured": true }
```

- `gitLinked: false` → **the project has no git link. Pushes are not deploying.** Reconnect it.
- `commitShort` not matching `git rev-parse --short HEAD` → a push did not deploy, or a build failed.
- `relayerConfigured: false` → the interactive section will refuse with `503`; every other
  surface still works.

Drift is detectable in one HTTP call, which is the point.

## What runs where

| | |
|---|---|
| Read path | fully static. Browser talks straight to the CC3 RPC and the Creditcoin prover — both return `access-control-allow-origin: *`, verified before the site was designed |
| `/api/claim` | the only server code, and the only writer. Exists solely because the relayer holds a key |
| `/api/version` | build provenance |

If `/api/claim` is down, the hero, the fault line, the three outcomes, the gallery and the trust
section are all unaffected. The argument does not depend on our infrastructure being up.

## Refilling the evidence pool

The interactive pool is pre-produced and pre-attested so nothing waits on a chain. When it empties
the site degrades to a complete "all evidence ruled on" state rather than an error — tested by
actually emptying it.

To refill: `cd phase0 && npx tsx probes/35-evidence-pool.ts` then
`npx tsx probes/37-pool-to-manifest.ts` (about eight minutes, most of it attestation), commit the
updated `demo/manifest.json`, push.
