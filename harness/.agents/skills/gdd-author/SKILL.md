---
name: gdd-author
description: Write or revise game/design/gdd.md from the concept, with machine-read front matter (exactly three pillars, scope within the tier budget, numeric targets, a feedback-events table) and the required sections. Use in the GDD stage and whenever the design changes.
---
# Author the GDD

1. Read `game/design/concept.md` and the genre fragment: `node --import tsx .agents/skills/gdd-author/scripts/fragment.ts <genre>`.
2. Copy `templates/gdd.template.md`, fill the front matter as JSON on one line between `---` markers, then the sections.
3. Front matter must satisfy `GddFrontmatter`: `title`, `genre`, `scopeTier`, `pillars` (exactly 3), `scope` {levels, enemies, items, bosses},
   `targets` {sessionMin, levelTimeS, deathsPerLevel}, `verbs`, `feedbackEvents` [{event, channels}] using only fixed-table events
   (jump, land, dash, hit, death, pickup, level_complete, ...) and channels (shake, hitstop, flash, particle, sfx).
4. Required sections: `## Concept`, `## Pillars`, `## Core loop` (30 s / 5 min / session), `## Progression`, `## Scope`, `## Feedback`.
5. Validate: `pnpm validate game/design/gdd.md`. Scope must fit the tier budget printed by `scripts/scope-budget.ts <genre> <tier>`.

For a castle game, a level is a region of rooms: `scope.levels` counts regions, the Concept names the relics that
reopen the castle and the altars the player rests at (a rest refills health and reloads the region; a fall returns the
player to the last altar), and the Progression orders the gates (the wings' ledge, then the boots' chasm).

Rules: one idea per pillar; verbs are the player's actions (run, jump, dash, stomp, move, attack); every feedback event names at least one channel; keep the body under 1,500 words.
