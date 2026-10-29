---
name: level-design
description: Produce levels as data under game/content/levels/ that pass the solver, follow the GDD ramp and match the scope. Use in the LEVELS stage and content edits. Generate, render, validate, repeat; never hand-patch tiles.
context: fork
agent: level-designer
---
# Level design loop

Files are `game/content/levels/L<nn>-<id>.json` (`LevelJson`), ordered by number. Count must equal the GDD scope.

1. Read the ramp: `game/design/gdd.md` (Progression) and the difficulty targets in `ramp-spec.md`.
2. Generate a candidate: `node --import tsx .agents/skills/level-design/scripts/generate-level.ts <genre> --seed <n> --difficulty <0..1> --out game/content/levels/L01-l01.json [--length N]`.
3. Look at it: `node --import tsx .agents/skills/level-design/scripts/render-level.ts <file>` (ASCII with spawn S, goal G, hazards ^, one-way -, entities as letters).
4. Validate: `pnpm validate <file>` (schema + solver: reachability, win path, safe start, hazards, collectibles) and the ramp: `node --import tsx .agents/skills/level-design/scripts/difficulty-report.ts game/content/levels`.
5. Fix by regenerating with a new seed or different difficulty/length, not by editing rows. Small entity tweaks (moving a coin or an enemy by a tile) are fine if you re-validate.
6. Stop when every level validates, the ramp is monotonic and the first level's difficulty is under 0.4.

For a freeform game, pass `freeform` as the genre: its levels come from its base genre's generator under the game's own
entity names. Its solver is the recorded winning run of each level (`game/content/proofs/<id>.json`): after you change a
level, its old run no longer proves it, and the worker records a new one (the `prove` check fails until it has).
