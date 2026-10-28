# Shmup GDD fragment

Verbs: move (eight directions inside the screen), shoot (hold the action key; shots fly up), dash (a short sidestep with a cooldown).
Level grammar: a single bordered screen (40 x 23 tiles of 8 px); the ship starts at the bottom centre. Content is content/waves.json: enemies arrive from the top on a schedule (patterns top, line, random).
Enemies: drone (dives and weaves, aimed bullet every 1.4 s, 2 hp), tank (slow straight descent, aimed bullet every 0.8 s, 6 hp). Ramming hurts. Power pickups drift down every 15 s.
Win by surviving until the timer (default 60 s); dying ends the run. Score comes from kills, power pickups and the win bonus.
Feel presets: arcade-ship (default), heavy-ship. Feedback table must bind: hit, death, pickup, level_complete, dash.
Scope tiers: small = one 60 s screen, 2 enemy types; medium = two screens, 3 types; large = three screens with a boss (later).
