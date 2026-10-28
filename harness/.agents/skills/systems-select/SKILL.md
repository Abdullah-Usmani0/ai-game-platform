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
