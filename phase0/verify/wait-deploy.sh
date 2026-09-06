#!/bin/bash
# Poll GitHub Deployments. Vercel creates these ONLY when git-linked, so their appearance is
# itself positive evidence of the link -- which is the thing a CLI-created project silently lacks.
for i in $(seq 1 160); do
  n=$(gh api repos/Arrears-Protocol/arrears/deployments --jq 'length' 2>/dev/null)
  if [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null; then
    gh api repos/Arrears-Protocol/arrears/deployments --jq '.[0] | "DEPLOYMENT sha=\(.sha[0:7]) env=\(.environment)"'
    exit 0
  fi
  sleep 15
done
echo "TIMEOUT: no GitHub deployment after 40 minutes"; exit 1
