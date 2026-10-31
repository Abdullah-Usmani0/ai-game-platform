# Castle GDD fragment

The castle tier: a tall hero (14x42 px, three tiles of 16 px) in a 480x270 view. Verbs: run, jump (variable height,
coyote time, buffer), cut, rest, and two earned abilities: the wings relic grants one air jump (double jump), the
boots relic the dash (one per airtime). Abilities last: through deaths, rests and into the next region.
The sword follows the game's frame data (content/moves.json): on the ground a chain of three cuts (a rising cut, a low
sweep, a lunging thrust), each pressed in the last one's window; in the air an overhead cut; with down in the air a
plunge that bounces off what it strikes. A cut roots the hero but for its own step, strikes each foe once, throws it
back, staggers it and holds the world a moment; a dash cuts a cut short late in it. A blow throws the hero back,
reeling. Foes take cuts to fell: a ghoul three, a hound two, a gargoyle four, a sentinel five, a wraith three, a bone
archer two. A cut strikes shots out of the air too.
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
Enemies attack with moves of their own, each winding up long enough to read and to answer with a cut: the ghoul
(shambles, lurches within 96 px, and in reach raises its claws over its skull, then rakes, lunging), the hound
(crouches, coils, then pounces jaws first), the gargoyle (its eyes and maw blaze for half a second, then it spits an
ember), the bone archer from difficulty 0.3 (patrols, draws an arrow back to its jaw for 40 ticks and looses it low and
fast, then backs away to draw again), the wraith from 0.45 (floats a tile over the floor and drifts at the player;
gathers ghost-fire between its raised hands for 36 ticks and casts a slow hex, then fades: it drifts 100 px on, through
the player, untouchable and harmless, and gathers again; it hurts only with its hexes), and from 0.5 the sentinel
(advances behind a tower shield, and in reach draws its spear back over its shoulder, then drives it out over the rim
with a step, the longest reach of the cast). A cut in a foe's wind-up
breaks the attack off. The sentinel's shield turns aside blows from the front, the hero thrown back unhurt, until its
guard breaks (three cuts; then it reels); over its head (the plunge), at its back, or once its thrust has swung the
shield open, blows land: bait the thrust, step back from it, and cut as it recovers.
Feel presets: castle-agile (default), castle-weighty. Every gate is sized to hold under both.
Feedback table must bind: jump, land, dash, hit, death, pickup, checkpoint, level_complete, custom:swing,
custom:finisher, custom:block, custom:guard_break.
Scope tiers: small = 1 region, 1-2 enemy types; medium = 1 region, 2-3 enemy types; large = 1 region, 3 enemy types + 1 boss.
