---
name: edit-apply
description: Apply a parameter or style edit request deterministically (range-checked) and report what it invalidates. Used by edit jobs routed as parameter or style; agents only consult it.
---
# Apply an edit

`node --import tsx .agents/skills/edit-apply/scripts/apply-params.ts '<json patch>'` merges `{ "<systemId>": { "<param>": value } }` into `design/systems.json`
after checking ranges against the catalog, then prints the impact (`levels`, `assets`, `code`) from `scripts/impact.ts`.
If impact says `levels`, re-validate every level and re-run the solver bot before the gate; if `assets`, regenerate assets; if `code`, this is a code edit, not a parameter edit.
