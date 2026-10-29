---
{"title":"Crate Cellar","genre":"puzzle","scopeTier":"small","pillars":["every push is a decision","boards read at a glance","mistakes cost nothing: undo is free"],"scope":{"levels":3,"enemies":0,"items":0,"bosses":0},"targets":{"sessionMin":10,"levelTimeS":60,"deathsPerLevel":0},"verbs":["move","push","undo"],"feedbackEvents":[{"event":"move","channels":["sfx"]},{"event":"push","channels":["sfx","particle"]},{"event":"undo","channels":["sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
Three cellar boards under an old inn. A cellar hand shoves crates of preserves onto the chalk marks on the floor before the cook comes down. One crate on the first board, two on the second, three on the last; walls and pillars decide which pushes are safe.

## Pillars
1. Every push is a decision: crates move one tile, only forwards; a crate pushed into a corner off its mark is stuck until you undo.
2. Boards read at a glance: walls, crates, marks and the player are four distinct shapes and colours; a crate on its mark lights up.
3. Mistakes cost nothing: undo takes back a move instantly and as often as you like; restart resets the board.

## Core loop
30 seconds: look at the board, find the crate that has to go first, push it. 5 minutes: solve a board, then solve it again in fewer moves. Session: all three cellars in one sitting.

## Progression
Cellar 1 (difficulty 0.1): one crate, four pushes. Cellar 2 (difficulty 0.3): two crates, eight pushes. Cellar 3 (difficulty 0.5): three crates around inner walls, nine pushes. Each board is proven solvable by the solver; difficulty is the fewest pushes it needs.

## Scope
3 boards, no enemies, no items, no bosses.

## Feedback
Steps tick, pushes thud with a puff of dust, undo rewinds with a soft sound, and a solved board celebrates. See the front-matter table.
