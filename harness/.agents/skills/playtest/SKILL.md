---
name: playtest
description: Run the deterministic bots against the built bundle and triage the playtest report. Use for the PLAYTEST stage and after any gameplay change.
allowed-tools: Bash(pnpm -C game build), Bash(pnpm exec gg-bots *), Read
---
# Playtest with bots

Run for each seed the stage asks for:

```
pnpm -C game build
pnpm exec gg-bots smoke game/dist --seed <seed> --ticks 600 --replay-check --out game/reports
```

Read `game/reports/playtest-report.json` (schema: `PlaytestReport` in `@gg/schemas`). It contains per-bot results with
`completed`, `deaths`, `crashes`, `finalHash`, `metrics` (fps, frameMsP95, heapMB, readyMs), `consoleErrors`, `replayHashMatch`
and `failures`. A failing report means one of: a console/page error, the ready flag never fired, the realtime hash differs
from the manual hash (non-determinism: look for time, randomness or render-driven state in simulation code), or the run
stopped early (a stuck or crashed sim).

Triage rules: report the failing seed and tick, the event counts (`jump`, `land`, `hit`, `death`, `pickup`, `level_complete`)
and the first console error verbatim. Never edit code from this skill.
