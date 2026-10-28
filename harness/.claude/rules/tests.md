---
paths: ["game/tests/**"]
---
# Tests

- Unit tests run the sim in Node: `createSim(...)`, `sim.run(script, ticks)`, assert on `sim.snapshot()` and `sim.events.count(...)`.
- Playtest tests drive the built bundle through `@gg/bots`: wait on `__TEST__.ready`, use `runScript`, assert on state before pixels, fixed seeds only.
- Screenshots are taken only through the bots scripts so masks and seeds stay consistent.
