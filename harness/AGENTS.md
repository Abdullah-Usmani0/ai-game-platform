# Game project harness

You are working on ONE game project on a fixed runtime: `@gg/sdk` (a deterministic simulation core)
rendered by Phaser 4. The current stage, its gate and your write scope are injected at session start
from `stage.json`. Do not guess them; read the injected summary.

## Commands (run from this directory)

- `pnpm gate` runs the gate for the current stage and writes `game/reports/gate-<stage>.json`. The gate is the definition of done.
- `pnpm -C game typecheck` / `pnpm -C game lint` / `pnpm -C game test` / `pnpm -C game build`
- `pnpm validate <file>` validates a design or content JSON artifact against its schema.
- `pnpm exec gg-bots smoke game/dist --seed <n> --ticks 600 --replay-check --out game/reports`
- `pnpm exec gg-bots contact-sheet game/dist --seed <n> --frames 12 --out game/reports`
- `pnpm catalog <genre>` exports the systems catalog for the systems-select skill.
- Skill scripts: `node --import tsx .agents/skills/<skill>/scripts/<script>.ts ...` (each SKILL.md lists its own).

## Stages, gates and skills

| Stage | Who | Gate | Skill |
|---|---|---|---|
| gdd | worker (structured) or you | validate:gdd, validate:style | gdd-author |
| systems | worker (structured) | validate:systems | systems-select |
| scaffold | worker | typecheck, lint, test, build, smoke | - |
| behaviour | worker (structured) or you | validate:behaviour, solver | behaviour-author |
| implement | you | typecheck, lint, test, build, smoke | mechanic-author, verify |
| levels | worker (generator + solver) or level-designer | validate:levels, validate:ramp, solver | level-design |
| integrate | you | validate:assets, build, smoke | asset-prompting |
| playtest | you (bots) | build, smoke, solver | playtest |
| juice | you | build, smoke, juice | juice-pass |
| review | gdd-reviewer | review (zero P0) | - |
| budget | worker | build, smoke, budget | budget-check |
| publish | worker | - | - |

Edit jobs run one route (parameter, style, behaviour, content, code) and then the regression skill before the gate.

## Project map

- `game/design/` concept.md, gdd.md, systems.json, style.json, deviations.md (the spec; machine-read front matter)
- `game/content/` levels/*.json, behaviour/*.fsm.json, rules/*.eca.json, waves.json, dialogue.json (data, validated on write)
- `game/src/systems/` bespoke simulation systems in GlueTS (see rules); `game/src/main.ts` is scaffolded, do not edit
- `game/assets/` requests.json and manifest.json; binary assets are produced by the asset pipeline, never by hand
- `game/tests/` unit and playtest tests; `game/reports/` gate, playtest, juice, budget and screenshot evidence
- `.agents/skills/` procedures with bundled scripts; `phaser-*` skills are engine reference only

## Non-negotiables (enforced by hooks and the gate, not by goodwill)

- TypeScript only. Simulation code is GlueTS: no `Math.random`, `Date`, timers, `async`, DOM or `window`, no classes, no `this`, no module-level `let`.
- Never import `phaser` or `@gg/sdk/render` from simulation code. Use the typed `@gg/sdk` System API: `defineSystem`, `ctx.rng`, `ctx.events`, `ctx.move`, `ctx.spawn`, `ctx.damage`.
- Randomness only through `ctx.rng`; time only through `ctx.tick` and `ctx.dt`. Every gameplay event goes through `ctx.emit` using the fixed event table.
- Levels and behaviour are data and must pass `pnpm validate`. Regenerate a failing level with a new seed; never hand-patch tiles.
- Never edit `node_modules`, `game/src/engine/**`, `game/provenance.json`, `game/reports/**`, `stage.json`, or anything under `.agents/` and `.claude/`.
- No network access and no new dependencies. Assets are referenced only through `game/assets/manifest.json`.

## Gotchas

- `?mode=manual` (or `?test=1`) disables realtime stepping; drive the game with `window.__game.step(n)` or `runScript`.
- Wait on `window.__TEST__.ready`; never sleep. `runScript` restarts the level from tick 0 and holds the sim at the target tick.
- Headless WebGL can diverge from GPU output. If a screenshot looks wrong, re-run `gg-bots smoke` once before trusting it.
- Phaser 4 is not Phaser 3: no `Point`, filters replace FX and masks, `roundPixels` defaults to false. Consult `phaser-v3-to-v4-migration` only when touching render code, which you normally never do.
- Integer scaling only. Placeholder asset keys equal final asset keys, so the swap never touches code.

## Workflow and definition of done

1. Read the injected stage summary and the last gate report. Work only inside the stage's write scope.
2. One feature or one system per session. Keep context small: read `game/reports/*.json` summaries, not raw logs.
3. Verify with the gate. Never declare done while `pnpm gate` fails; the Stop hook will send you back with the failure summary.
4. Your final message lists the commands you ran and the report paths, in at most ten lines.

## Design docs are the spec

`game/design/gdd.md` is authoritative. If the implementation must deviate, append the reason to `game/design/deviations.md`;
never edit a locked `gdd.md`. `systems.json` and `style.json` are schema-checked on every write.

## Edit mode

If `game/design/edit-request.json` exists, scope every change to it, list `affected_scenes` in your final message,
do not regenerate unrelated content, and run the regression skill before the gate.

## Cost discipline

Prefer the bundled scripts over reasoning for deterministic work. Do not re-read files you have not changed.
Summaries over transcripts: the gate report is the evidence, not your narration.
