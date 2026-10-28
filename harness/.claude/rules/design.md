---
paths: ["game/design/**"]
---
# Design documents

- `gdd.md` front matter is machine-read (`GddFrontmatter`): exactly three pillars, scope within the tier budget, numeric targets, a feedback-events table.
- After the GDD stage `gdd.md` is locked; edit jobs may amend it with the diff recorded in `deviations.md` (append-only).
- `systems.json` and `style.json` are validated on every write; invalid writes are rejected by the PostToolUse hook.
