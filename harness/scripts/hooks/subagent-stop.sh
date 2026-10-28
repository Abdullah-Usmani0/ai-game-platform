#!/usr/bin/env bash
# SubagentStop for level-designer: every level must validate before the subagent may finish.
set -u
cd "$(dirname "$0")/../.." || exit 0
fail=0
for f in game/content/levels/*.json; do
  [ -f "$f" ] || continue
  out=$(pnpm validate "$f" 2>&1) || { echo "$f: $(echo "$out" | tail -n 5)" >&2; fail=1; }
done
[ "$fail" -eq 0 ] && exit 0
echo "Some levels do not validate; regenerate them before finishing." >&2
exit 2
