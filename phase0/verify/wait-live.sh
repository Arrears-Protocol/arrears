#!/bin/bash
# Watch for either signal that Vercel has landed: a GitHub Deployment (which only appears when
# the project is git-linked) or the custom domain answering. Emits one line per state change.
prev=""
for i in $(seq 1 240); do
  n=$(gh api repos/Arrears-Protocol/arrears/deployments --jq 'length' 2>/dev/null || echo 0)
  d=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://arrears.0xo.in/ 2>/dev/null || echo 000)
  cur="deployments=$n domain=$d"
  if [ "$cur" != "$prev" ]; then echo "$(date +%H:%M:%S) $cur"; prev="$cur"; fi
  if [ "$n" -gt 0 ] 2>/dev/null && [ "$d" = "200" ]; then echo "READY"; exit 0; fi
  sleep 15
done
echo "TIMEOUT"; exit 1
