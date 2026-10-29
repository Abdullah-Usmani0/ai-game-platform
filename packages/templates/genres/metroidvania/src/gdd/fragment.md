# Metroidvania GDD fragment

Verbs available: run, jump (variable height, coyote time, buffer), stomp, and two earned abilities: the wings relic grants
one air jump (double jump) and the boots relic grants the dash (one per airtime). Keys open locked doors on contact.
Level grammar: one cavern per level, 8 px tiles, 23 rows, ceiling and side walls. The wings lie behind the start (the
player backtracks to find them); a 5-tile cliff only a double jump clears; a key on a 5-tile pillar; a locked door set
in a wall from the ceiling down; the boots; a 16-tile spike pit that needs the double jump and the dash. Corridors between
gates use the platformer's chunks (steps, small spike pits, low walls, one-way platforms, enemies).
Abilities persist through death; picking up a relic moves the checkpoint. Each level is its own cavern: abilities reset.
Enemies: walker (patrols, chases within 48 px), hopper (waits then hops), turret (fires bolts within 96 px).
Feel presets: celeste-class (default), floaty-cozy, heavy-retro. Every gate is sized to hold under each of them.
Feedback table must bind: jump, land, dash, hit, death, pickup, checkpoint, level_complete.
Scope tiers: small = 1 cavern, 1-2 enemy types; medium = 2 caverns, 2-3 enemy types; large = 3 caverns, 3 enemy types + 1 boss.
