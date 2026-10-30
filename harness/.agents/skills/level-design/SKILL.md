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
level, its old run no longer proves it, and the worker records a new one (the `prove` check fails while a run that stops
winning is on file). A level no bot wins waits for a player's winning run, and the game is not listed until then.
Where the search loses its way (a maze, a long walk round, a goal behind a detour), hints guide it:
`game/content/hints/<id>.json` (`LevelHints`, checked by `pnpm validate`) lists up to twelve steps in order, each
`{"kind": "reach", "x": .., "y": .., "r": 1}` (stand within r tiles of a tile) or `{"kind": "hud_at_least", "key": ..,
"value": ..}` (a HUD number, or the score, at least so much). Put a step at each turn the way takes, not on every tile,
never inside a wall, and end at the goal. The worker writes them when no bot wins a level and keeps only hints that
found the win; after an edit that moves the way, hints that no longer find it are dropped with the run.
A game with `carry` has its stations placed on every level as it is generated (a source and its dropoffs): top-down
they stand on solid tiles of their own, on open floor away from the spawn and the goal, all within a screen of the spawn,
with no one-tile squeezes between them; side view they stand on the main path, the source near the start and the dropoffs
further on, each pair reachable both ways. Moving one is a level edit like any other: the validator says which rule it
breaks (`station_unreachable`, `station_one_way`, `station_blocks`...), and its courier re-records the winning run.
