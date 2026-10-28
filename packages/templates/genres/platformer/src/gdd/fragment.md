# Platformer GDD fragment

Verbs available: run, jump (variable height, coyote time, buffer), dash (short burst, cooldown), stomp (land on enemies).
Level grammar: tilemap of 8 px tiles, 23 rows; chunks are pits with spikes (2-3 wide), one-tile steps, walls (1-2 tall),
one-way platforms two tiles up, enemies on flat ground. Levels end at a goal tile; the first 10 tiles are always safe.
Enemies: walker (patrols, chases within 48 px), hopper (waits then hops at the player), turret (fires bolts within 96 px).
Feel presets: celeste-class (default), floaty-cozy, heavy-retro. Choose exactly one; it changes what the solver accepts.
Feedback table must bind: jump, land, hit, death, pickup, level_complete. Dash if the dash verb is used.
Scope tiers: small = 1-3 levels, 1-2 enemy types; medium = 4-6 levels, 2-3 enemy types; large = 7-10 levels, 3 enemy types + 1 boss.
