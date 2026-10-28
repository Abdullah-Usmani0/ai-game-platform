#!/usr/bin/env bash
# PreCompact: persist stage, gate status and open issues so the compacted session can resume.
set -u
cd "$(dirname "$0")/../.." || exit 0
mkdir -p game/reports
{
  echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) compaction checkpoint"
  [ -f stage.json ] && node -e 'const s=JSON.parse(require("fs").readFileSync("stage.json","utf8")); console.log(`stage=${s.stage} attempt=${s.attempt??1}`)'
  last=$(ls -t game/reports/gate-*.json 2>/dev/null | head -1)
  [ -n "$last" ] && node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(`last gate passed=${r.passed}`); for (const c of r.checks??[]) if(!c.passed) console.log(`- open: ${c.name}`)' "$last"
} >> game/reports/progress-notes.md
exit 0
