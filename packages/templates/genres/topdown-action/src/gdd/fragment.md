# Top-down action GDD fragment

Verbs: move (eight directions), dash (short invulnerable-feeling burst with a real cooldown), attack (directional melee swing on the action key; holding swings on cooldown; swings parry arrows).
Level grammar: rooms. A floor is a grid of rectangular rooms (12-15 x 8-10 tiles of 8 px) joined by three-wide doors; the entry room is empty, the exit sits in the deepest room. Cover tiles appear from difficulty 0.35.
Enemies: grunt (rushes on sight, telegraphed bite, 2 hp), archer (keeps distance, shoots arrows, 2 hp), brute (slow, long wind-up, 2-damage bite, 6 hp). Nothing hurts by touch: every attack is telegraphed (custom:windup) and interruptible by a hit. Behaviour is data (BehaviourFsm) using the genre vocabulary.
Win by reaching the exit after every hostile on the floor is dead (room-clear locks it); dying ends the run. Score comes from kills, gems and the exit bonus.
Feel presets: room-melee (default), room-heavy. Feedback table must bind: hit, death, pickup, level_complete, dash.
Scope tiers: small = 2 floors, 2 enemy types; medium = 4 floors, 3 types; large = 6 floors, 3 types and a boss (later).
