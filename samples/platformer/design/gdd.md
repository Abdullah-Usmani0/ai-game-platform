---
{"title":"First Steps","genre":"platformer","scopeTier":"small","pillars":["tight, forgiving jumps","readable hazards at a glance","one short level that teaches by doing"],"scope":{"levels":1,"enemies":1,"items":1,"bosses":0},"targets":{"sessionMin":3,"levelTimeS":45,"deathsPerLevel":2},"verbs":["run","jump","dash","stomp"],"feedbackEvents":[{"event":"jump","channels":["sfx"]},{"event":"land","channels":["sfx"]},{"event":"hit","channels":["shake","flash","sfx"]},{"event":"death","channels":["flash","sfx"]},{"event":"pickup","channels":["sfx","particle"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
A single-screen-wide cave run. The player runs right, hops two-tile gaps with spikes at the bottom, clears a two-tile wall with a held jump, grabs coins from a one-way ledge and stomps a patrolling walker before reaching the exit. Everything the player needs is visible before it is needed.

## Pillars
1. Tight, forgiving jumps: Celeste-class constants with coyote time and jump buffering so the input always feels honoured.
2. Readable hazards at a glance: spikes are only ever at the bottom of pits, walkers are the only moving threat.
3. One short level that teaches by doing: gap, step, wall, ledge, enemy, exit, in that order.

## Core loop
30 seconds: run, jump a gap, land, collect. 5 minutes: clear the level, retry for all coins and no deaths. Session: a handful of attempts.

## Progression
One level with a gentle ramp: flat run, first gap, a one-tile step, a two-tile wall, a one-way ledge with coins, a second walker, the exit.

## Scope
1 level, 1 enemy type (walker), 1 item type (coin), no bosses.

## Feedback
Every jump and landing has a sound. Hits shake the camera, flash and play a sound. Death flashes. Pickups and the exit celebrate with sound and particles. See the front-matter table; the juice linter proves it at playtest time.
