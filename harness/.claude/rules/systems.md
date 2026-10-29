---
paths: ["game/src/systems/**"]
---
# Simulation systems (GlueTS)

- Author with `defineSystem({ id, init, fixedUpdate, onEvent? })` from `@gg/sdk`. State is the plain object returned by `init`.
- `fixedUpdate` is deterministic: same input and state produce the same result. Read parameters from `ctx.params` (declared in `systems.json`).
- Move bodies only with `ctx.move`; damage only with `ctx.damage`; spawn only with `ctx.spawn`; emit only fixed-table events plus `custom:*`.
- Every system has a sibling `*.test.ts` under `game/tests/unit/` that runs the sim in Node without Phaser.
- Forbidden: `phaser` imports, `window`, timers, `Math.random`, `Date`, `async`, classes, `this`, module-level `let`, and writes into module-level objects from a function (keep state in the system state object).
- Spawn entity types that have hand-made art: walker, hopper, turret, chaser, brute, grunt, archer, drone, tank (enemies); warden (a boss: entity defs with `boss: true` get a health bar and heavy feedback); bolt, bullet, arrow, ember, shot (projectiles); coin, gem, xp, power, key, wings, boots (pickups); crate, target, door (props). Any other type is drawn as a plain shape in its `tint` colour, so reuse one of these unless the design needs something new.
