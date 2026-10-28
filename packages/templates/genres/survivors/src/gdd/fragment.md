# Survivors GDD fragment

Verbs: move (eight directions), dash (short burst), attack (automatic, nearest enemy in range). Collect xp from kills.
Level grammar: a walled arena of 8 px tiles (about 56 x 34) with a few pillars; the player starts at the centre.
Content: content/waves.json schedules enemy waves (ring, edge, random, line patterns). Enemies: chaser (fast, 2 hp), brute (slow, 6 hp, 2 damage).
Win by surviving until the timer (default 60 s); dying ends the run. Score comes from xp and the win bonus.
Feel presets: arena-melee (default), arena-heavy. Feedback table must bind: hit, death, pickup, level_complete, dash.
Scope tiers: small = one arena, 60 s, 1-2 enemy types; medium = 2 arenas, 120 s, 2 types; large = 3 arenas, 180 s, 3 types.
