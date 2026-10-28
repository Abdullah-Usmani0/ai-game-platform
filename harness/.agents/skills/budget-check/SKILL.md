---
name: budget-check
description: Performance and size budgets every build must meet (bundle size, assets, time to ready, frame time, heap). Use when the gate reports a budget failure.
---
# Budgets

Defined in `budgets.json` at the harness root and enforced by `pnpm gate` (check `budget`):

| Budget | Default | Where it comes from |
|---|---|---|
| `gameJsKbGzip` | 300 | gzip size of `game/dist/game.js` (engine chunk excluded) |
| `assetsMb` | 4 | total bytes under `game/dist/assets` |
| `readyMs` | 2000 | `playtest-report.json` readyMs (time to `__TEST__.ready`) |
| `frameMsP95` | 16.7 (x1.5 allowance headless) | `playtest-report.json` bots[0].metrics.frameMsP95 |
| `heapMb` | 128 | bots[0].metrics.heapMB |

Fixes in order: remove per-frame allocations in systems, cap entity counts in waves, reduce atlas sizes, split large levels.
Never raise a budget to pass the gate; budgets change only through the template, not per game.
