# Castle GDD fragment

The castle tier: a tall hero (14x42 px, three tiles of 16 px) in a 480x270 view. Verbs: run, jump (variable height,
coyote time, buffer), stomp, rest, and two earned abilities: the wings relic grants one air jump (double jump), the
boots relic the dash (one per airtime). Abilities last: through deaths, rests and into the next region.
Level grammar: a level is a region of rooms, each a screen (30x17 tiles), on a grid: doorways join neighbours on a row,
and a shaft of one-way ledges joins the rows. The wings lie in a room behind the start (the player goes back for them);
along the top row halls lead to a save altar and a 4-tile ledge only a double jump climbs, then more halls and the
boots; from difficulty 0.2 a shaft at the far end drops to the second altar on the row below, and the way runs back
left past a hall and a 10-tile spike chasm only the double jump with the dash crosses, to the way out under the first
altar. There a shaft of ledges climbs to an iron grate in the first altar's floor: a head that meets it from below opens
it for good, a shortcut loop (the wings climb back to the rest, a fall drops to the way out). Halls use one-way ledges,
low walls, spike trenches and enemies. No stretch between altars runs past four rooms.
Resting at an altar (up) refills health, moves the checkpoint there and loads the region again from that rest: its
enemies back, what the player found and opened kept. A fall returns the player to their last rest a second later the
same way, keeping what they found since. Enemies sleep until the player enters their room and keep to it.
Enemies: ghoul (shambles, lurches within 96 px), hound (crouches, bounds), gargoyle (spits embers within 192 px).
Feel presets: castle-agile (default), castle-weighty. Every gate is sized to hold under both.
Feedback table must bind: jump, land, dash, hit, death, pickup, checkpoint, level_complete.
Scope tiers: small = 1 region, 1-2 enemy types; medium = 1 region, 2-3 enemy types; large = 1 region, 3 enemy types + 1 boss.
