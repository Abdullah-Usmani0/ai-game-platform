---
name: mechanic-author
description: Write a bespoke simulation system in GlueTS under game/src/systems/ when no catalog system covers a GDD mechanic, with its contract in game/design/mechanics.json. Use in the IMPLEMENT stage and code edits.
---
# Author a bespoke system (GlueTS)

A system is pure data in, pure data out, and says what it does before it does it. Copy `examples/timed-switch.ts` or
`examples/homing-pickup.ts` with its contract from `examples/mechanics.json`, then:

1. Write its contract first, in `game/design/mechanics.json` (`MechanicsFile`): `{ id, summary, controls, provides,
   requires, emits, hud }`.
   - `controls`: what it does with each key it reads (`"action": "flip the switch"`). A key another system already
     uses for something else is refused (validate:systems).
   - `provides`: only what it owns in the game: `win`, `death`, `movement`, `combat`, `spawns` (the entity types it
     spawns, all of them the game's own). Leave the win to the `objectives` system when you can; a system that owns
     the win must report its progress (`progress(state, ctx)`, 0 to 1), so bots and the explorer can steer toward it.
   - `emits`: every event it emits, `spawn` and `hit`/`damage` included when it spawns or hurts; `hud`: every HUD key it
     writes (a key starting with `_` is for the view, never shown).
2. `defineSystem<State>({ id, init, fixedUpdate, onEvent?, progress? })` from `@gg/sdk`. `id` is lowercase-kebab and
   matches the contract.
3. Read parameters from `ctx.params` (declare them in the GDD and, if user-tunable, in `design/systems.json` under your system id).
4. Touch the world only through `ctx`: `ctx.world`, `ctx.map`, `ctx.move(entity, dx, dy)`, `ctx.spawn(type, x, y)`, `ctx.damage(target, amount, source)`, `ctx.emit(name, payload)`, `ctx.rng`, `ctx.tick`, `ctx.dt`.
5. Emit only fixed-table events (`jump`, `land`, `hit`, `damage`, `death`, `pickup`, `score`, `spawn`, `despawn`, `level_complete`, `checkpoint`) or `custom:<name>`.
6. Keep all of its state in the state object `init` returns, as plain data: the game must save, load and run beside
   another copy of itself exactly.
7. Register it in `game/src/systems/index.ts` (`BESPOKE` array) and add `game/tests/unit/<id>.test.ts` that runs the sim in Node with a scripted input and asserts on state and event counts.
8. `pnpm -C game typecheck && pnpm -C game lint && pnpm -C game test`.
   - The game's test holds the code to its contract: anything it emits, spawns, writes to the HUD or reads that the
     contract leaves out, a win or game over it does not claim, state outside its state object, standing still
     winning, or a call slower than a millisecond fails, naming the system and what it did.
   - A freeform game also records its levels' winning runs with its own code: run `pnpm -C game prove` after any change
     to how the game plays, or the test fails on runs that no longer win.

Forbidden (the linter blocks them): `phaser`, `window`, DOM, timers, `Math.random`, `Date`, `async`, classes, `this`, module-level `let`, and writes into module-level objects from a function (keep state in the system state object).
Keep systems under 150 lines; split otherwise. If a mechanic needs a new entity type, add it in the GDD scope first and ask for an `entityDefs` entry via `design/deviations.md`.
