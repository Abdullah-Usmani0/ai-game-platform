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

## Content the systems read

Some systems play with content the idea decides, written right after systems.json and held to the rules it sets. A farm
(`farming`, `shop`, `shipping`, `season`) reads `game/content/crops.json` (`CropTable`): three or four crops in shop
order, the first being the starter seeds, each `{ id, name (at most 10 letters), seedPrice, sellPrice, growDays,
regrowDays?, look: { shape: root|leafy|tall|bush, color } }`. A crop must ripen within the season (growDays at most
days - 1) and pay for its seeds; no crop may be worse than another in every way, two crops of one shape need clearly
different colours, and an ideal season on a small field has to earn a real purse. `pnpm validate game/content/crops.json`
runs the same check against the game's systems.json: errors leave nothing worth farming, warnings are cards no player
should see. Changing the season's rules later (fewer days, a pricier pack) can turn a good table into a warning.

## Freeform games

A freeform game's `systems.json` (`FreeformSystemsJson`) has `genre: "freeform"` and `composition: { base }`, the GDD's
base genre. `pnpm catalog freeform <base>` lists the systems it may use: every genre's whose movement matches the base's.
No system is required, but the composition rules hold: exactly one system moves the player and exactly one decides the
win (the `objectives` system can: reach the goal, survive, defeat, collect, a HUD value), one rule decides what a death
does when anything can hurt the player, every system's needs are met (its movement, the entities and content it uses),
and no key has two uses.

Two blocks only freeform games compose:
- `auto-run` (side view) makes a runner: the player runs right on their own at `pace` of the feel's top speed, rising by
  `rampPerMin`; left and right do nothing, so the play page and the explorer leave them out, and the levels are generated
  as long as the GDD's level time at that pace. It cannot go with `movement-metroidvania`, whose maps are won by going back.
- `player-shooter` `aim`: `up` (a vertical shooter), `facing` (top-down where the arrows last pointed; side view forward,
  or up with up held), `nearest` (the closest hostile within `range`: a twin-stick arena on one fire key). A side view
  takes `facing` or `nearest`. In an arena, a `defeat` clause beside `survive` makes the shots needed: a good kiter
  outlasts a minute without firing.

The composition stage then writes, as data:
- `game/content/entities.json` (`EntityRoster`): the game's names for shipped entities, `{ type, archetype: "<genre>:<type>", hp }`
  with `hp` a health scale from 0.5 to 3; entities left out keep their own names.
- `game/content/objectives.json` (`Objectives`) when `objectives` is selected: `win { mode: all|any, clauses }` and `lose`
  rules; a `survive` clause needs a `lives` rule, so dying always costs something.
- the content its systems read (above), named to go with its entities: a moon garden's glowcaps and starberries.

The check script runs the same rules as the gate's `validate:systems`, composition and objectives included.
