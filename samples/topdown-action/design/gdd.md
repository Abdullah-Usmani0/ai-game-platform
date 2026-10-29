---
{"title":"Ember Halls","genre":"topdown-action","scopeTier":"medium","pillars":["every room is a readable fight","hits land heavy, dashes feel safe","every floor makes the run stronger"],"scope":{"levels":3,"enemies":3,"items":1,"bosses":1},"targets":{"sessionMin":6,"levelTimeS":90,"deathsPerLevel":2},"verbs":["move","dash","attack"],"feedbackEvents":[{"event":"dash","channels":["sfx"]},{"event":"hit","channels":["hitstop","shake","sfx"]},{"event":"death","channels":["flash","sfx"]},{"event":"pickup","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
A short run through ember-lit halls. Two floors of rooms joined by doors, then the warden's lair. Grunts rush when they see you, archers hold the far wall and shoot, brutes wind up slowly and bite hard, and each exit stays locked until the floor is clear. Strike in a three-hit chain whose third blow is a heavy finisher, lunge out of a dash, dodge through attacks; after each floor choose one of three boons that stays with you for the rest of the run.

## Pillars
1. Every room is a readable fight: enemies wake on sight (never through a wall), every attack flashes red before it lands, nothing hurts by touch.
2. Hits land heavy, dashes feel safe: hit pause and shake on every swing that connects, a bigger crunch on finishers and dash-strikes; the dash cannot be hit while it lasts.
3. Every floor makes the run stronger: a boon after each cleared floor (damage, reach, speed, dash, knockback, hearts) carries into the next, so the warden meets a stronger hero.

## Core loop
30 seconds: step into a room, bait the grunts, chain a finisher, dash through an arrow. 5 minutes: clear a floor with fewer hits and pick the boon that fits. Session: the full run to the warden, then a cleaner run with different boons.

## Progression
Floor 1 (difficulty 0.25): a few rooms, grunts and an archer. Floor 2 (difficulty 0.5): more rooms, archers behind cover, a brute. Floor 3 (difficulty 0.55): guarded rooms, then the lair: the warden slams up close after a long wind-up, fires rings of embers at range and enrages at half health (faster, its slams throwing a slow wave of embers). The first room of every floor is empty.

## Scope
3 floors, 3 enemy types (grunt, archer, brute), 1 boss (the warden, on the last floor), 1 item (gem), 7 boons.

## Feedback
Swings that hit freeze and shake; finishers, dash-strikes and the warden's slam and roar hit harder; deaths flash; dashes and pickups sound; the boss's health shows along the bottom; clearing a floor celebrates at the exit. See the front-matter table (custom events are bound in design/feedback.json).
