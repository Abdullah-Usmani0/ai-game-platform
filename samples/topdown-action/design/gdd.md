---
{"title":"Ember Halls","genre":"topdown-action","scopeTier":"small","pillars":["every room is a readable fight","hits land heavy, dashes feel safe","clear the room to open the door"],"scope":{"levels":2,"enemies":2,"items":1,"bosses":0},"targets":{"sessionMin":6,"levelTimeS":90,"deathsPerLevel":2},"verbs":["move","dash","attack"],"feedbackEvents":[{"event":"dash","channels":["sfx"]},{"event":"hit","channels":["hitstop","shake","sfx"]},{"event":"death","channels":["flash","sfx"]},{"event":"pickup","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
Two floors of ember-lit halls. Each floor is a handful of rooms joined by doors; grunts rush when you step in, archers hold the far wall and shoot, and the exit stays locked until the floor is clear. A directional swing, a dash with a real cooldown, gems for score.

## Pillars
1. Every room is a readable fight: enemies wake on sight, cover is a single tile, nothing attacks from off screen.
2. Hits land heavy, dashes feel safe: hit pause and shake on every swing that connects; a dash crosses an arrow's path.
3. Clear the room to open the door: the exit shows locked until the last hostile falls, then celebrates.

## Core loop
30 seconds: step into a room, bait the grunts, swing twice, dash out of an arrow. 5 minutes: clear a floor with fewer hits, grab every gem. Session: both floors in one run, then a cleaner run.

## Progression
Floor 1 (difficulty 0.2): two or three rooms, grunts only. Floor 2 (difficulty 0.45): more rooms, archers behind cover, cover tiles. Difficulty rises monotonically; the first room of every floor is empty.

## Scope
2 floors, 2 enemy types (grunt, archer), 1 item (gem), no bosses.

## Feedback
Swings that hit freeze and shake; deaths flash; dashes and pickups sound; clearing the floor celebrates at the exit. See the front-matter table.
