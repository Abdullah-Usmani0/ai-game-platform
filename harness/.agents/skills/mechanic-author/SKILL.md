---
name: mechanic-author
description: Write a bespoke simulation system in GlueTS under game/src/systems/ when no catalog system covers a GDD mechanic. Use in the IMPLEMENT stage and code edits.
---
# Author a bespoke system (GlueTS)

A system is pure data in, pure data out. Copy `examples/timed-switch.ts` or `examples/homing-pickup.ts`, then:

1. `defineSystem<State>({ id, init, fixedUpdate, onEvent? })` from `@gg/sdk`. `id` is lowercase-kebab.
2. Read parameters from `ctx.params` (declare them in the GDD and, if user-tunable, in `design/systems.json` under your system id).
3. Touch the world only through `ctx`: `ctx.world`, `ctx.map`, `ctx.move(entity, dx, dy)`, `ctx.spawn(type, x, y)`, `ctx.damage(target, amount, source)`, `ctx.emit(name, payload)`, `ctx.rng`, `ctx.tick`, `ctx.dt`.
4. Emit only fixed-table events (`jump`, `land`, `hit`, `damage`, `death`, `pickup`, `score`, `spawn`, `despawn`, `level_complete`, `checkpoint`) or `custom:<name>`.
5. Register it in `game/src/systems/index.ts` (`BESPOKE` array) and add `game/tests/unit/<id>.test.ts` that runs the sim in Node with a scripted input and asserts on state and event counts.
6. `pnpm -C game typecheck && pnpm -C game lint && pnpm -C game test`.

Forbidden (the linter blocks them): `phaser`, `window`, DOM, timers, `Math.random`, `Date`, `async`, classes, `this`, module-level `let`.
Keep systems under 150 lines; split otherwise. If a mechanic needs a new entity type, add it in the GDD scope first and ask for an `entityDefs` entry via `design/deviations.md`.
