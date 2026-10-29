---
name: edit-apply
description: Apply a parameter, style or authored-content edit deterministically (range-checked or solver-checked) and report what it invalidates. Used by edit jobs routed as parameter or style and by level editor edits; agents only consult it.
---
# Apply an edit

`node --import tsx .agents/skills/edit-apply/scripts/apply-params.ts '<json patch>'` merges `{ "<systemId>": { "<param>": value } }` into `design/systems.json`
after checking ranges against the catalog, then prints the impact (`levels`, `assets`, `code`) from `scripts/impact.ts`.
If impact says `levels`, re-validate every level and re-run the solver bot before the gate; if `assets`, regenerate assets; if `code`, this is a code edit, not a parameter edit.

## Authored content (the level editor)

Levels the user edits arrive on the edit request as `content.levels`. The worker's `apply-content` stage replaces the file with
the same level id only after the schema, the genre validator under the game's feel preset and the solver bot (with this
game's systems, behaviours and content) accept it; an unknown id or any rejection fails the stage and nothing is written.
The level's ramp is kept from the previous file when the edit omits it. The gate then re-runs `validate:levels`,
`validate:ramp` and the game's own solver test, and the job continues with playtest, budget and publish.
