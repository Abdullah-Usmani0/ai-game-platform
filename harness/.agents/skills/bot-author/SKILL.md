---
name: bot-author
description: Write a bot of the game's own under game/src/bots/ that wins the levels no bot of the platform can, with the game's own systems, so their winning runs can be recorded. Use in the BOT stage of a freeform game whose levels wait for a winning run.
---
# Author a bot of the game's own (GlueTS)

A level is listed only once it has a recorded winning run. The platform's bots (the base genre's solver, a block's
bot, the explorer, which climbs the level's hints) know only the catalog's rules; when this game's own systems change
how a level is won, they lose, and the level waits for a player. Your bot knows the game: it plays it the way its rules
ask, and its winning run proves the level. Copy `examples/moth.ts` (the bot) beside `examples/owl.ts` (the system it
plays around, with its contract in `examples/mechanics.json`), then:

1. See what waits and why: `pnpm -C game prove` prints `waiting for a winning run: l02 (solver: no win in 5400 ticks (0
   deaths); explorer: no win in 40000 ticks (best: progress 0.84 at 50,16))`. Read the game's own systems (`game/src/systems`,
   `game/design/mechanics.json`) and the win (`game/content/objectives.json`): what does a player have to do that a bot
   that only runs at the goal does not?
2. Write the bot in `game/src/bots/<name>.ts`: a `BotPolicy`, `(sim, tick, mem) => InputState`, called once a tick.
   - Start from `emptyInput()` (`@gg/sdk`) and set the keys held this tick: `left`, `right`, `up`, `down`, `jump`,
     `dash`, `action`. A press is a new hold: to press again, let go for a tick first.
   - Read the sim, never change it: `sim.world.player` (`x`, `y`, `w`, `h`, `vx`, `vy`, `grounded`, `alive`, `hp`,
     `facing`, `invulnTicks`), `sim.world.entities` (`type`, `alive`, `x`, `y`, `props`, `anim`), `sim.world.hud` (what
     the systems show the player), `sim.map` (`tileSize`, `kindAt(x, y)` of a tile: `air`, `solid`, `hazard`, `oneway`,
     `goal`; `level.spawn`, `level.goal` in tiles), `sim.tick`, and how the player moves (`sim.options.feel`: `maxRun`,
     `runAccel`, `gravity`, `jumpSpeed`, in pixels and seconds).
   - Play by what a player can see: the HUD, the entities, the tiles. A bot that reads a system's hidden state wins
     levels no player can read.
   - Keep what it remembers between ticks in `mem`, a `Record<string, number>` that starts empty on every run.
3. Get about with `@gg/template-core`'s helpers rather than your own path finding:
   - `goToward(sim, spot, input, tick, mem, near?)` heads for a spot (an entity, or any `{ x, y, w, h }` in pixels):
     top-down a shortest walk at the player's own size; side view toward it, jumping at walls, pits, hazards and foes
     and landing on solid ground. It keeps its own memory in `mem` under keys starting with `go`, and a bot that stops
     calling it for a while (to wait, to hide) starts afresh when it calls again.
   - `goalSpot(sim)` is the goal tile; `boxGap(a, b)` the gap between two boxes in pixels (0 when they touch).
4. List it in `game/src/bots/index.ts`: `export const GAME_BOTS: Record<string, BotPolicy> = { moth };`.
5. `pnpm -C game typecheck && pnpm -C game lint && pnpm -C game prove && pnpm -C game test`. `prove` tries your bot
   after the platform's solver and before the explorer, and records a run it wins (`by: "bot"`); `test` replays every
   recorded run. Improve the bot until no level waits; a level it still cannot win ships waiting for a player.

Never change a level, a system, the rules or the GDD to make a bot win: the bot proves the game as it is. Forbidden (the
linter blocks them, as in systems): `Math.random` (use `botRandom(sim, mem)` from `@gg/template-core`), `Date`, timers,
`async`, classes, `this`, module-level `let`, and writes into module-level objects from a function.
