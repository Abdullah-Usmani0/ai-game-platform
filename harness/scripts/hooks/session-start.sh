#!/usr/bin/env bash
# Injects the stage, gate, design summary, last reports and budget into the session context (stdout).
set -u
cd "$(dirname "$0")/../.." || exit 0
if [ -f stage.json ]; then
  node -e '
    const s = JSON.parse(require("fs").readFileSync("stage.json", "utf8"));
    console.log(`## Stage: ${s.stage} (attempt ${s.attempt ?? 1})`);
    console.log(`Gate: ${(s.gate ?? []).join(", ")}`);
    console.log(`Write scope: ${(s.allowedWrite ?? []).join(", ") || "(none)"}`);
    if (s.budget) console.log(`Budget left: ${s.budget.turnsLeft ?? "?"} turns, $${s.budget.usdLeft ?? "?"}, model ${s.model ?? "?"} (${s.runner ?? "?"})`);
    if (s.skills?.length) console.log(`Skills for this stage: ${s.skills.join(", ")} (read .agents/skills/<name>/SKILL.md first)`);
    if (s.task) console.log(`Task: ${s.task}`);
  '
if [ -f .agents/skills/playbook/entries/*.md ] 2>/dev/null; then :; fi
genre=$(node -e '
  try { const s = JSON.parse(require("fs").readFileSync("game/design/systems.json", "utf8")); process.stdout.write(s.genre || ""); } catch { process.stdout.write(""); }
')
if [ -n "$genre" ] && [ -f ".agents/skills/playbook/entries/$genre.md" ]; then
  echo "## Playbook ($genre)"
  head -n 12 ".agents/skills/playbook/entries/$genre.md"
fi
else
  echo "## Stage: unknown (no stage.json)"
fi
if [ -f game/design/gdd.md ]; then
  echo "## GDD front matter"
  awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f' game/design/gdd.md | head -40
fi
last_gate=$(ls -t game/reports/gate-*.json 2>/dev/null | head -1)
if [ -n "$last_gate" ]; then
  echo "## Last gate ($last_gate)"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(`passed=${r.passed} stalled=${r.stalled ?? false}`);
    for (const c of r.checks ?? []) if (!c.passed) console.log(`- FAIL ${c.name}: ${String(c.detail).slice(0, 300)}`);
  ' "$last_gate"
fi
if [ -f game/reports/playtest-report.json ]; then
  echo "## Last playtest"
  node -e '
    const r = JSON.parse(require("fs").readFileSync("game/reports/playtest-report.json", "utf8"));
    console.log(`passed=${r.passed} replayHashMatch=${r.replayHashMatch} readyMs=${r.readyMs} failures=${JSON.stringify(r.failures)}`);
  '
fi
if [ -f game/reports/progress-notes.md ]; then
  echo "## Progress notes (tail)"
  tail -n 20 game/reports/progress-notes.md
fi
exit 0
