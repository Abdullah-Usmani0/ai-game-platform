---
{"title":"Last Light","genre":"survivors","scopeTier":"small","pillars":["constant forward pressure","every kill feeds the next","sixty seconds, no filler"],"scope":{"levels":1,"enemies":2,"items":1,"bosses":0},"targets":{"sessionMin":5,"levelTimeS":60,"deathsPerLevel":2},"verbs":["move","dash","attack"],"feedbackEvents":[{"event":"dash","channels":["sfx"]},{"event":"hit","channels":["hitstop","flash","sfx"]},{"event":"death","channels":["shake","sfx"]},{"event":"pickup","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
A single walled arena. Chasers pour in from the edges, then in rings around the player. The player attacks the nearest enemy automatically and dashes out of trouble. Survive sixty seconds.

## Pillars
1. Constant forward pressure: waves every five seconds, each a little bigger.
2. Every kill feeds the next: enemies drop xp that scores and marks progress.
3. Sixty seconds, no filler: the run ends in victory or death, then restart.

## Core loop
30 seconds: dodge, let the auto-attack clear the closest chaser, grab xp. 5 minutes: survive the full minute with fewer hits. Session: a handful of runs chasing a cleaner one.

## Progression
Edge spawns first, rings from the second third, a brute late if the difficulty allows. Pressure ramps linearly.

## Scope
1 arena, 2 enemy types (chaser, brute), 1 item (xp), no bosses.

## Feedback
Hits freeze and flash, deaths shake, dashes and pickups sound, the win celebrates. See the front-matter table.
