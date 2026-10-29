---
name: systems-select
description: Choose and parameterise template systems for the game in game/design/systems.json from the catalog, so every GDD feedback event and verb is covered. Use in the SYSTEMS stage and for parameter edits.
---
# Select systems

1. Export the catalog for the genre: `pnpm catalog <genre>` (prints `catalog.json`: id, summary, params with ranges and defaults, events emitted, feedback it can bind).
2. Write `game/design/systems.json` (`SystemsJson`): `version: 1`, `genre`, `feelPreset` (one of the genre's presets), `systems: [{ id, params }]`.
   - Include every `required` system. Add optional ones only when the GDD needs them.
   - Params must stay inside the catalog ranges; omit a param to take its default.
   - Every GDD feedback event must be bindable by some selected system's `feedbackFor`.
3. Validate: `pnpm validate game/design/systems.json` (schema) and `node --import tsx .agents/skills/systems-select/scripts/check.ts` (catalog, ranges, required, feedback coverage).
4. Scaffolding and re-scaffolding are worker steps, never yours: the worker runs `gg-scaffold` from these files.

Bespoke behaviour that no catalog system covers goes through `mechanic-author`, not into systems.json.

## Freeform games

A freeform game's `systems.json` (`FreeformSystemsJson`) has `genre: "freeform"` and `composition: { base }`, the GDD's
base genre. `pnpm catalog freeform <base>` lists the systems it may use: every genre's whose movement matches the base's.
No system is required, but the composition rules hold: exactly one system moves the player and exactly one decides the
win (the `objectives` system can: reach the goal, survive, defeat, collect, a HUD value), one rule decides what a death
does when anything can hurt the player, every system's needs are met (its movement, the entities and content it uses),
and no key has two uses.

The composition stage then writes, as data:
- `game/content/entities.json` (`EntityRoster`): the game's names for shipped entities, `{ type, archetype: "<genre>:<type>", hp }`
  with `hp` a health scale from 0.5 to 3; entities left out keep their own names.
- `game/content/objectives.json` (`Objectives`) when `objectives` is selected: `win { mode: all|any, clauses }` and `lose`
  rules; a `survive` clause needs a `lives` rule, so dying always costs something.

The check script runs the same rules as the gate's `validate:systems`, composition and objectives included.
