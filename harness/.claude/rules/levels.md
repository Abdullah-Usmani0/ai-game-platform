---
paths: ["game/content/levels/**", "game/content/waves.json", "game/content/progression.json"]
---
# Levels and progression

- Levels are data (`LevelJson`): legend characters, rows, entities, spawn, goal, ramp. Files are `L01-<slug>.json`; order is `progression.json`.
- Every save must pass `pnpm validate <file>` and the level validator. Fields under `_solver` are generated, never hand-edited.
- To fix a failing level, regenerate with a new seed or adjust its generator parameters; do not patch tiles by hand.
