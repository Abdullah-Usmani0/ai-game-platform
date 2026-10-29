---
name: regression
description: Compare the current build against the last accepted version: masked screenshot diff and metrics (completion, deaths, frame time, bundle size) that may not regress. Use before the gate on every edit job.
---
# Regression

1. Goldens live in `game/reports/goldens/` (captured by `scripts/golden.ts` from the accepted version's bundle).
2. `node --import tsx .agents/skills/regression/scripts/diff.ts game/dist` runs the same scripted seeds, captures frames at the same ticks and diffs them against the goldens with HUD and particle regions masked. Scenes listed in `design/edit-request.json` `affected_scenes` are allowed to differ; others must match within tolerance.
3. `node --import tsx .agents/skills/regression/scripts/metrics-compare.ts` compares the new playtest report with the accepted one: crashes 0, the scripted smoke run still finishes if it did, p95 frame time within 10%, bundle within budget. Every level's solver run is the gate's `solver` check.
Only improving revisions are accepted: if a metric regresses, fix it or explain it in `design/deviations.md` for the reviewer.
