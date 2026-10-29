# Puzzle (Sokoban-class) GDD fragment

Verbs: move (one tile per press on the four arrows; holding repeats), push (walk into a crate to slide it one tile; crates are never pulled and only one moves at a time), undo (the action key takes back the last move, free and unlimited), restart (the dash key resets the board).
Level grammar: tilemap boards of 8-12 x 7-9 tiles of 16 px, walled all round, with a few short inner walls. Crates and targets are entities; every board has as many targets as crates and is solved when each target holds a crate.
Every board is checked by the solver: it must be solvable within the search budget, start with no crate already stuck (a crate pushed into a corner off its target can never leave), and not start solved. The fewest pushes a solution needs is the difficulty measure; boards ramp from one crate and two pushes to four crates and about eighteen.
No enemies, hazards or deaths: the only failure is a stuck crate, and undo is the way out. Score is the solve bonus; moves and pushes show on the HUD.
Feel presets: grid-snappy (default), grid-calm. Step slide time and key repeat are grid-push params. Feedback table must bind: move, push, undo, level_complete.
Scope tiers: small = 3 boards; medium = 6 boards; large = 10 boards.
Ask (one at a time, short): How many boards should the game have? Should it start gentle (one crate) and end hard, or stay relaxed throughout? Should steps feel snappy or calm? What is pushed, and where (crates in a warehouse, boulders in a temple, presents under a tree)? What is the mood (cosy, eerie, playful)?
