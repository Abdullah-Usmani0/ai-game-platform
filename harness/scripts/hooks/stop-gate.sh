#!/usr/bin/env bash
# Stop hook: the turn cannot end red. Runs the stage gate; exit 2 sends the failure summary back to the agent.
# Stall rule: the same failure signature twice in a row ends the turn with stalled=true so the worker can retry or escalate.
set -u
cd "$(dirname "$0")/../.." || exit 0
[ -f stage.json ] || exit 0
input=$(cat)
if echo "$input" | grep -q '"stop_hook_active": *true'; then
  : # already inside a stop-hook continuation; still run the gate so the agent cannot end red
fi
pnpm gate >/tmp/gg-gate.log 2>&1
status=$?
stage=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("stage.json","utf8")).stage||"stage")')
report="game/reports/gate-${stage}.json"
if [ "$status" -eq 0 ]; then
  exit 0
fi
if [ -f "$report" ] && node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).stalled ? 0 : 1)' "$report"; then
  echo "Gate failed with the same signature twice; stopping so the worker can retry or escalate." >&2
  exit 0
fi
echo "Gate '${stage}' failed. Fix these and finish again:" >&2
if [ -f "$report" ]; then
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const c of r.checks ?? []) if (!c.passed) console.error(`- ${c.name}: ${String(c.detail).split("\n").slice(0, 8).join("\n  ")}`);
  ' "$report" 2>&1 | head -n 40 >&2
else
  tail -n 40 /tmp/gg-gate.log >&2
fi
exit 2
