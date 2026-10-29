---
{"title":"Undervault","genre":"metroidvania","scopeTier":"small","pillars":["every wall is a promise","a new ability changes the map","backtracking pays off"],"scope":{"levels":1,"enemies":2,"items":3,"bosses":0},"targets":{"sessionMin":6,"levelTimeS":60,"deathsPerLevel":3},"verbs":["run","jump","dash","stomp","explore"],"feedbackEvents":[{"event":"jump","channels":["sfx"]},{"event":"land","channels":["sfx"]},{"event":"dash","channels":["sfx","particle"]},{"event":"hit","channels":["shake","flash","sfx"]},{"event":"death","channels":["flash","sfx"]},{"event":"pickup","channels":["sfx","particle","flash"]},{"event":"checkpoint","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
A single cavern under a sealed vault. The way forward is a cliff too tall to climb, so the player turns back and finds a pair of wings in the dark behind the start. With the double jump the cliff falls, a key waits on a pillar top, a locked door gives way, and past it lie the boots. The last stretch is a long spike pit that only a double jump and a dash can cross.

## Pillars
1. Every wall is a promise: each obstacle the player cannot pass yet is visible before the relic that beats it.
2. A new ability changes the map: the wings turn the cliff and the pillar into paths; the boots turn the pit into a bridge.
3. Backtracking pays off: the first relic is behind the start, and every pickup moves the checkpoint forward.

## Core loop
30 seconds: walk right, meet the cliff, turn back and find the wings. 5 minutes: climb, take the key from the pillar, open the door, take the boots, cross the pit. Session: a few runs chasing a clean crossing with no falls.

## Progression
Wings, then the key and the door, then the boots and the pit. Abilities persist through deaths; each pickup moves the checkpoint.

## Scope
1 cavern, 2 enemy types (walker, hopper), 3 relics (wings, key, boots), no bosses.

## Feedback
Jumps and landings sound, the dash trails particles, hits shake and flash, relic pickups flash and sparkle, checkpoints chime, reaching the exit celebrates. See the front-matter table.
