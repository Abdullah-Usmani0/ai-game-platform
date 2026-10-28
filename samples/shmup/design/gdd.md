---
{"title":"Static Sky","genre":"shmup","scopeTier":"small","pillars":["every bullet is readable","the ship answers instantly","sixty seconds of rising pressure"],"scope":{"levels":1,"enemies":2,"items":1,"bosses":0},"targets":{"sessionMin":5,"levelTimeS":60,"deathsPerLevel":2},"verbs":["move","shoot","dash"],"feedbackEvents":[{"event":"dash","channels":["sfx"]},{"event":"hit","channels":["flash","sfx"]},{"event":"death","channels":["shake","flash","sfx"]},{"event":"pickup","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
One screen of static-filled sky. Drones dive and weave from the top firing aimed bullets, tanks grind down the middle after the midpoint, and power cells drift down every fifteen seconds. Hold fire, slide under targets, sidestep bullets, survive the minute.

## Pillars
1. Every bullet is readable: aimed shots at 90 px/s, never more than a handful on screen, no off-screen fire.
2. The ship answers instantly: near-instant acceleration, a short sidestep dash with a real cooldown.
3. Sixty seconds of rising pressure: waves every four seconds, each a little bigger; tanks after the midpoint.

## Core loop
30 seconds: slide under the first drones, hold fire, dodge the first aimed bullet. 5 minutes: survive the minute with fewer hits, catch every power cell. Session: a handful of runs chasing a cleaner one.

## Progression
Drones only for the first half; tanks join after the midpoint; pressure ramps linearly to the end of the minute.

## Scope
1 screen, 2 enemy types (drone, tank), 1 item (power cell), no bosses.

## Feedback
Hits flash and sound, deaths shake and flash, dashes and pickups sound, surviving the minute celebrates. See the front-matter table.
