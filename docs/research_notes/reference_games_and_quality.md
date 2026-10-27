# Top 2D / Platformer Reference Games (2015–2026) and What Makes Them Look and Feel "High Quality"

Scope note for the report writer: this session's tooling could fetch raw GitHub files but almost every other domain (maddymakesgames.com, 80.lv, yachtclubgames.com, unrealengine.com, gamedeveloper.com, wikipedia.org, saint11.org, gigazine) failed DNS through the proxy, and the web-search budget was exhausted before engine confirmations for several titles could be sourced. Everything below with a URL was seen in a search result or fetched page. Items I know from background knowledge but could NOT source in this session are listed under "Gaps / Unverified background knowledge" in each section and should be confirmed before publication.

The single best primary source found is the public Celeste source code (`Player.cs`), which gives exact, developer-authored game-feel constants. It is used heavily in Key Question 2.

---

## Key Question 0 (part a): Which 15–25 2D games are the most important references, and what are their genre, art style, reception/sales, engine and team size?

### Takeaway
The commercially dominant 2D games of 2015–2026 cluster into five art families (low-res pixel art, high-res/"HD" pixel art, hand-painted/illustrated, hand-drawn animation/cel, and HD-2D hybrid) and seven genres (farming/life sim, sandbox survival, metroidvania, precision platformer, action roguelike, deckbuilder roguelike, survivors-like/auto-battler). Team sizes range from 1 (Stardew, Animal Well, Balatro, Katana ZERO, Undertale) to ~20 (Supergiant), and engine choice is heterogeneous (GameMaker, Unity, custom C++/C#/Haxe, LÖVE, UE4), which suggests the engine is not what produces the perceived quality.

### Cited Findings (per game; "[unverified]" marks background knowledge not sourced this session)

**Stardew Valley** (farming/life sim, low-res pixel art, top-down)
- Sold more than 41 million copies across platforms as of December 2024, per ConcernedApe's official press site; ~26M on PC and 7.9M on Switch — [VGC](https://videogameschronicle.com/news/stardew-valley-has-now-sold-more-than-40-million-copies); [Nintendo Life](https://www.nintendolife.com/news/2024/12/stardew-valley-has-now-sold-more-copies-than-mario-kart-wii)
- Previous official figure was 30M in February 2024, so ~10M copies sold in 2024 alone (attributed to the 1.6 update) — [VGC](https://videogameschronicle.com/news/stardew-valley-has-now-sold-more-than-40-million-copies)
- Engine/team: [unverified] solo developer Eric Barone; XNA, later ported to MonoGame.

**Terraria** (2D sandbox survival/crafting, low-res pixel art, side-view)
- 60.7 million units announced October 2024 (33M on PC); 70 million announced at the 15th anniversary in May 2026 (39.6M PC, 10.7M console, 19.7M mobile) — [Notebookcheck](https://www.notebookcheck.net/Terraria-once-again-puts-AAA-titles-to-shame-with-over-60-million-sales.916845.0.html); [MassivelyOP](https://massivelyop.com/2026/05/20/legendary-multiplayer-sandbox-terraria-celebrates-15-years-of-live-service-with-over-70m-copies-sold); [GamingOnLinux](https://www.gamingonlinux.com/2026/05/re-logic-celebrate-15-years-of-terraria-70-million-sales-cross-play-soon-and-more-updates-to-come/page=1/)
- Engine/team: [unverified] Re-Logic, originally XNA (C#); small team.

**Hollow Knight** (metroidvania, hand-drawn/painted 2D, high-res)
- ~15 million copies sold since 2017 launch, per co-founders Ari Gibson and William Pellen in an August 2025 Bloomberg interview; 2.8M before Silksong's 2019 announcement, ~12M after — [Nintendo Life](https://www.nintendolife.com/news/2025/08/hollow-knight-has-now-sold-almost-15-million-copies); [KitGuru](https://www.kitguru.net/page/71/!https:/www.kitguru.net/tech-news/mustafa-mahmoud/hollow-knight-has-sold-over-15-million-copies/)
- Core team of three: Ari Gibson (art/animation), William Pellen (design), David Kazi (technical); soundtrack outsourced to Christopher Larkin — [Red Bull interview](https://www.redbull.com/us-en/hollow-knight-nintendo-interview)
- Built in Unity using built-in tools and Asset Store extensions — [Unity case study](https://unity.com/made-with-unity/hollow-knight)
- Team deliberately moved away from pixel art (common in indie games at the time) toward a hand-drawn aesthetic (secondary write-up) — [Cohorted](https://app.cohorted.co.uk/news/team-cherry-interview-exploring-the)
- Pellen described the goal of making the game look painted: "we used brushes, we used paper, and we even used some old camera techniques" (aggregator quoting Polygon; not verified against original) — [StrongerU aggregator](https://dna.strongeru.com/?p=797225)

**Hollow Knight: Silksong** (metroidvania, hand-drawn 2D)
- 7M+ copies in just over three months after Sept 4, 2025 launch, excluding Game Pass, per Team Cherry (Nov 2025) — [TweakTown](https://tweaktown.com/news/109417/hollow-knight-silksong-sells-7-million-copies-since-launch-with-millions-of-game-pass-players/index.html); [WN Hub](https://wnhub.io/news/investment/item-49578)
- Alinea Analytics ranked it #4 indie earner on Steam in 2025 at $75M — [Game World Observer](https://gameworldobserver.com/2025/12/22/indie-projects-generated-a-quarter-of-the-total-game-revenue-on-steam-by-the-end-of-2025-analytics)

**Celeste** (precision platformer, low-res pixel art)
- Renders at a constant 320x180 regardless of window size (community forum claim, not official) — [Steam Community](https://steamcommunity.com/app/504230/discussions/0/3832043350345268297)
- The original Celeste prototype (Pico-8) used a 16-colour palette; a CCC talk notes Pico-8's 16 colours are "really cleverly chosen artistically" — [CCC camp2023 transcript](https://static.media.ccc.de/media/conferences/camp2023/camp2023-57155-eng-Celeste_opus.txt)
- Pedro Medeiros credited as pixel artist / art director — [Game Developer](https://www.gamedeveloper.com/design/celeste-64-interview)
- Full player-movement source code is public (C#) — [NoelFB/Celeste Player.cs](https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs)
- Engine/team/sales: [unverified] custom C#/XNA-FNA "Monocle" engine; ~6-person team (Maddy Thorson, Noel Berry, Pedro Medeiros, Amora Bettany, Lena Raine, Kevin Regamey); >1M copies by 2019.

**Hades** (isometric action roguelike, hand-painted 2D characters/environments)
- 1M copies by Sept 20, 2020: 700k during Early Access (Dec 2018 start, year-long Epic exclusivity), +300k within days of the Sept 17, 2020 1.0 release, PC + Switch — [PC Gamer](https://www.pcgamer.com/au/mythological-roguelike-hades-has-sold-more-than-1-million-copies); [Twinfinite](https://twinfinite.net/news/hades-surpasses-1-million-copies-sold-with-700k-sold-during-its-early-access-period/)
- Won Game of the Year, Best Audio and Best Design at the 2020–2021 Game Developers Choice Awards — [GDC](https://gdconf.com/news/dive-dialogue-hades-gdc-2021)
- Art director Jen Zee won the 2021 BAFTA Games Award for Artistic Achievement; her work on Bastion was praised as "lush hand-painted 2D artwork" — [Wikipedia: Jen Zee](https://en.wikipedia.org/wiki/Jen_Zee); [Aidan Moher profile](https://aidanmoher.com/blog/2014/05/videogames/artwork-jen-zee/)
- Kasavin: "replayability was a foremost goal on Hades so the multiplicative design content and story that adapts to player progression were key aspects" (secondary) — [Benjamin Glover Substack](https://benjaminglover.substack.com/p/why-hades-was-a-success)
- Team size "approximately 20 people" (low-quality unsourced blog) — [brainbound.blog](https://brainbound.blog/hades-budget-breakdown)
- Engine: [unverified] Supergiant's in-house C++ engine (used since Bastion), Lua scripting.

**Hades II** (action roguelike, hand-painted 2D)
- Exited Early Access Sept 25, 2025 on Switch, Switch 2, PC — [FullCleared](https://fullcleared.com/news/hades-ii-exits-early-access-on-september-25/)
- Alinea Analytics estimate: 2M copies during 16-month EA, 1.5M in first two months, ~$54.5M gross at $29.99 — [Game World Observer](https://gameworldobserver.com/2024/05/07/hades-2-79k-concurrent-players-vs-other-supergiant-games); peak 103,567 concurrent at EA launch — [Game Developer](https://gamedeveloper.com/business/hades-2-launches-in-early-access-with-over-100k-players)

**Dead Cells** (action roguelike / "roguevania", high-res pixel art rendered from 3D)
- 10M+ copies sold, announced June 5, 2023, six years after 2017 EA launch; 34 free updates; Evil Empire now supports it — [GamesPress release](https://gamespress.com/Dead-Cells-Has-Sold-More-Than-10-Million-Copies); [Gematsu](https://www.gematsu.com/2023/06/dead-cells-sales-top-10-million-further-updates-planned-through-2025)
- Art pipeline: Thomas Vasseur (sole artist in year one) built a character model and skeleton in 3DS Max, exported FBX, rendered to pixel-art sprites so retakes don't require redrawing every frame — [Habr](https://habr.com/post/416589); [Nintendo Life](https://www.nintendolife.com/news/2018/05/feature_reanimating_the_roguelike_with_dead_cells_developer_motiontwin)
- Backgrounds/decorations drawn by hand in Photoshop and then redrawn as normal maps so a dynamic 3D lighting system can tint them; one asset set recolored per biome; "modern take on pixel art, using lots of particles, an emphasis on motion and special effects, a 3D lighting system, and lots of shaders" — [80.lv](https://80.lv/articles/interview-with-the-developers-of-dead-cells)
- Visuals are "3D models rasterized in order to create a pixelated, retro appearance"; sprites are real 2D sprites built from 3D, not a runtime filter — [Hardcore Gamer](https://hardcoregamer.com/previews/pax-east-2017-dead-cells-turns-constant-death-into-killer-metroidvania-action/250542/); [Steam thread](https://steamcommunity.com/app/588650/discussions/0/1291817208492158139)
- Engine: [unverified] Haxe + Heaps.io (Motion Twin's own stack).

**Balatro** (poker roguelike deckbuilder, pixel art + CRT shader)
- 250k copies in first 72 hours; 500k in 10 days; 1M by March 18, 2024 (<1 month); 2M at 5.5 months; later 3.5M (date and mobile inclusion unclear) — [Game Developer](https://www.gamasutra.com/business/localthunk-s-balatro-sells-250-000-copies-in-first-three-days); [Game World Observer](https://gameworldobserver.com/2024/03/18/balatro-sales-1-million-copies-first-month-localthunk); [WN Hub](https://wnhub.io/news/finance/item-46507)
- Engine/team: [unverified] solo dev LocalThunk; LÖVE (Lua) framework.

**Vampire Survivors** (survivors-like / auto-shooter, low-res pixel art)
- Engine: Phaser (HTML5) until v1.6, Unity from v1.6 onward; full engine switch shipped Aug 17, 2023 for cross-platform support and performance — [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors); [GamingOnLinux](https://www.gamingonlinux.com/2023/07/vampire-survivors-switching-to-new-game-engine-on-august-17); [Phaser news](https://phaser.io/news/2024/02/vampire-survivors-space-54)
- Began as a small project by Luca Galante while unemployed, released at very low cost; sales far exceeded expectations — [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)
- Sales figures: not found this session (gap).

**Shovel Knight** (retro platformer, NES-style 8-bit pixel art)
- Yacht Club took a "rose-tinted" 8-bit approach: stuck to the NES palette plus four extra colours; removed sprite flicker (NES limit of 8 sprites per scanline) because they felt it was detrimental; emulated audio to sound like late Konami NES titles rather than stock NES; limited onscreen objects and particle effects on purpose because "those limits forced them to be more creative"; the stated test was whether it still "felt like an NES game" — [Game Developer: Breaking the NES](https://www.gamedeveloper.com/design/breaking-the-nes-for-shovel-knight); [Yacht Club blog](https://www.yachtclubgames.com/blog/breaking-the-nes/); [Nintendo Life interview](https://www.nintendolife.com/news/2015/03/interview_yacht_club_games_talk_drawing_in_8-bit_and_aspirations_for_shovel_knight_64)
- Resolution: [unverified] 400x240 (widescreen NES-height); sales [unverified] >3M by 2020; custom C++ engine [unverified].

**Cuphead** (run-and-gun, 1930s hand-drawn cel animation)
- Animation runs at 24 fps "like an old animated movie" while gameplay runs at 60 fps (Chad Moldenhauer) — [Unity case study](https://unity.com/made-with-unity/cuphead); [Windows Central](https://windowscentral.com/check-out-how-cuphead-team-makes-its-cool-looking-2d-animations)
- Animated "on the ones" (every frame drawn, not every second frame); 120,000+ frames "one hundred percent" hand-drawn, only concession was painting frames digitally — [Inverse](https://www.inverse.com/article/36647-xbox-one-cuphead-animation)
- ~25 minutes of work per frame on average; frame count "closer to 50,000 than the 15,000 originally estimated" (conflicts with Inverse's 120k; likely different counting) — [GamesRadar](https://gamesradar.com/the-making-of-cuphead)
- Engine: Unity — [Unity](https://unity.com/made-with-unity/cuphead). Team size: not found.

**Katana ZERO** (action platformer, high-res pixel art, neo-noir)
- Built by Justin Stander in GameMaker Studio 2; 500k copies in under a year; launched Apr 18, 2019 — [Wikipedia](https://en.wikipedia.org/wiki/Katana_Zero)
- 100k in first week (PC + Switch), Devolver's second-fastest-selling Switch title behind Enter the Gungeon — [Nintendo Life](https://www.nintendolife.com/news/2019/04/katana_zero_sold_more_than_100000_copies_in_its_first_week)

**Pizza Tower** (fast platformer, hand-drawn-look pixel art, 90s cartoon style)
- Built with GameMaker; built a fandom via Patreon early builds and demos — [Wikipedia](https://en.wikipedia.org/wiki/Pizza_Tower)
- Won Best Game at GameMaker Awards 2023 (150+ entries) — [GamesPress](https://gamespress.westeu-v2.propressroom.com/pt/Pizza-Tower-Berserk-Boy-and-Super-Chicken-Jumper-triumph-in-GameMaker-)
- Third-party Steam estimates ~1.5M copies / ~$18.3M gross (medium confidence) — [Raijin](https://raijin.gg/app/2231450/Pizza_Tower); SteamSpy 1–2M owners — [SteamSpy](https://steamspy.com/dev/Tour+De+Pizza). No official figure.

**Animal Well** (metroidvania/puzzle, low-res pixel art with dynamic lighting)
- Solo developer Billy Basso, ~7 years, wrote the entire engine himself — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well); engine from scratch, custom animation and movement tuning discussed — [Software Engineering Daily](https://softwareengineeringdaily.com/2024/05/15/animal-well-with-billy-basso/); custom tools — [Game Maker's Notebook](https://gamemakersnotebook.libsyn.com/making-animal-well-as-a-solo-game-developer-with-billy-basso)
- Codebase described as hand-crafted C++ with no class inheritance, just entity lists (secondhand talk summary) — [waylonwalker note](https://go.waylonwalker.com/thought-642.txt)
- Resolution [unverified] 320x180; ~33 MB executable [unverified].

**Undertale** (top-down RPG, deliberately lo-fi pixel art)
- Made in GameMaker — [GameDesignSkills list](https://gamedesignskills.com/game-design/famous-gamemaker-games)
- SteamSpy estimated ~979,800 Steam sales early in its life (dated) — [Gaming Trend](https://gamingtrend.com/news/undertale-has-sold-just-under-a-million-copies-on-steam). Current total not found (gap); solo dev Toby Fox [unverified].

**Slay the Spire** (roguelike deckbuilder, illustrated 2D)
- 1.5M+ copies by GDC 2019 (Casey Yano); two co-founders (Giovannetti, Yano) plus collaborators; first two days sold ~2,200; China accounted for 30–43% of sales (sources disagree) — [Game Developer](https://gamasutra.com/business/after-a-worrisome-start-i-slay-the-spire-i-has-sold-more-than-1-5-million-copies); [PCGamesN](https://www.pcgamesn.com/slay-the-spire/slay-the-spire-one-million-sales)
- Slay the Spire 2 (Godot engine) hit 3M units in its first EA week (2026) — [GamingOnLinux](https://gamingonlinux.com/2026/03/the-godot-powered-slay-the-spire-2-has-already-hit-over-3-million-sales)
- Original engine [unverified]: libGDX (Java).

**Sea of Stars** (turn-based RPG, high-res pixel art with dynamic lighting)
- 100k copies day one; 250k in first week, which was the studio's original full-year projection — [Game Developer](https://gamedeveloper.com/business/sea-of-stars-sold-100-000-copies-in-one-day); [Hitmarker](https://hitmarker.net/news/retro-inspired-rpg-sea-of-stars-sells-250-000-units-in-its-first-week-518069)
- Listed in Unity's Made With Unity Aug 2023 roundup alongside Blasphemous 2 — [Unity blog](https://unity.com/blog/news/made-with-unity-monthly-roundup-august-2023)

**Blasphemous / Blasphemous 2** (metroidvania/soulslike, high-res pixel art)
- Blasphemous 2 (The Game Kitchen) made with Unity — [Unity blog](https://unity.com/blog/news/made-with-unity-monthly-roundup-august-2023). Sales not found (gap).

**Ori and the Blind Forest / Will of the Wisps** (metroidvania, painted/hand-drawn HD 2D on 3D-ish layers)
- Unity [unverified], Moon Studios; sales not found (gap).

**Octopath Traveler I/II** (JRPG, HD-2D)
- HD-2D combines pixel sprites with 3D environments using dynamic lighting, depth of field and tilt-shift for a diorama look; term coined/trademarked by Square Enix for the 2018 game (dev Acquire) — [Wikipedia](https://en.wikipedia.org/wiki/HD-2D); [TechRaptor](https://techraptor.net/gaming/news/trademark-for-octopath-travelers-hd-2d-filed-by-square-enix)
- Acquire's lead programmer: relied heavily on Unreal Engine 4 to build a robust game with a relatively small staff — [Wikipedia](https://en.wikipedia.org/wiki/HD-2D)
- Famitsu (via Siliconera): first attempts "didn't add enough depth to the view, and it was uninteresting"; next attempt "went too far on the resolution and saturation, losing the appeal of pixel art" — [Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/)
- Octopath II: backgrounds almost entirely 3D; hard to make 3D backgrounds fit the sprites; camera rotation limited by how far it could rotate before visual quality suffered — [Unreal Engine interview](https://www.unrealengine.com/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style?lang=en-US)

**Enter the Gungeon / Hyper Light Drifter / Hotline Miami** — mentioned only as comparators (Gungeon as Devolver's fastest-selling Switch title — [Nintendo Life](https://www.nintendolife.com/news/2019/04/katana_zero_sold_more_than_100000_copies_in_its_first_week)); engines [unverified]: Unity / GameMaker / GameMaker.

### Inferences
- Engine is not a quality predictor: GameMaker (Undertale, Katana ZERO, Pizza Tower), Unity (Hollow Knight, Cuphead, Sea of Stars, Blasphemous 2), custom (Celeste, Animal Well, Hades, Dead Cells), LÖVE (Balatro), UE4 (Octopath) all produced top-tier results.
- Solo and 2–3 person teams dominate the list; what they share is a single strong art owner with a tightly constrained style (one palette, one resolution, one animation method).
- Sales leaders are the "forever games" (Stardew 41M, Terraria 70M, Dead Cells 10M, Hollow Knight 15M) whose long-tail came from years of free updates, not launch polish alone.

### Gaps / Unverified background knowledge
- Could not source this session: Vampire Survivors sales; Undertale current totals; Ori and Blasphemous sales; Hades/Supergiant engine and exact headcount; Dead Cells engine (Heaps/Haxe); Celeste engine (XNA/FNA/Monocle) and team; Stardew engine (XNA/MonoGame) and solo-dev status; Balatro engine (LÖVE) and solo-dev status; Shovel Knight resolution and sales; Slay the Spire libGDX; Animal Well resolution. All are widely reported and I believe them to be correct, but they need a confirming citation.

---

## Key Question 1: Which 2D genres are most popular with players and most tractable to generate?

### Takeaway
By revenue, action roguelikes, metroidvanias and roguelike deckbuilders have the highest per-game averages among indie 2D sub-genres, but all are hit-driven; by raw unit volume, farming/life sim and sandbox survival (Stardew, Terraria) dwarf everything else. Roguelike deckbuilders are notable for very few releases (99 tagged games 2019–2022) relative to their median success.

### Cited Findings
- Chris Zukowski (VG Insights data, 2019–2022, AA/AAA and <10-review games filtered out): roguelike deckbuilders were the most commercially successful indie tag by median sales, with only 99 such games released since 2019 — [WN Hub summary of Zukowski](https://wnhub.io/news/analytics/item-4582)
- GameDiscoverCo-cited lifetime Steam averages (July 2025 recap): Action Roguelike $8.4M average per game (104 games), Metroidvania $7.9M (53 projects); averages are skewed because "almost all revenue comes from select hits" — [GameDev Reports](https://gamedevreports.substack.com/p/weekly-gaming-reports-recap-july-8d7)
- Separate GameDiscoverCo 2025 figures list visual novels ($4.2M) and roguelike deckbuilders ($3.4M) as the lowest average revenue per game among subgenres analyzed (note: contradicts Zukowski's median-based ranking; different metric and period) — [GameDev Reports](https://gamedevreports.substack.com/p/weekly-gaming-reports-recap-july-8d7)
- Roguelite revenue on Steam estimated at $400M in 2025, up 80% on 2024 ("the roguelite cull hasn't happened") — [Recognizing Patterns](https://recognizingpatterns.substack.com/p/the-roguelite-cull-hasnt-happened)
- Action games and RPGs account for roughly three-quarters of Steam game revenue — [WN Hub analytics](https://wnhub.io/news/analytics/item-48136)
- Steam earned a record $17.7B Jan 1–Dec 19, 2025; indie games ~$4.4B (about a quarter); top 2025 indie earners were Schedule I ($151M), R.E.P.O. ($147M), PEAK ($87M), Silksong ($75M), Escape from Duckov ($53M) — [Game World Observer](https://gameworldobserver.com/2025/12/22/indie-projects-generated-a-quarter-of-the-total-game-revenue-on-steam-by-the-end-of-2025-analytics)
- Zukowski's 2025 year-in-review exists but its content was not retrieved — [How To Market A Game](https://howtomarketagame.com/2026/01/27/what-the-hell-happened-in-2025/)
- Unit-volume leaders are 2D farming/life sim (Stardew 41M) and 2D sandbox (Terraria 70M) — see KQ0 citations.

### Inferences
- For a generator, tractability ranking (my inference from the mechanics involved, not from sources): (1) survivors-like and deckbuilder roguelikes are the most tractable because they are systems-heavy and content-light per asset (few animations, UI-centric, procedural); (2) top-down farming/life sim is tractable in art (tile-based, 16px sprites, few frames) but content-heavy in scripting; (3) precision platformer is tractable in art and level data but the feel layer must be exact (see KQ2); (4) action roguelike (Hades/Dead Cells) and metroidvania are least tractable because they need large hand-animated character sets and bespoke boss design.
- Of the top-2025 earners, only Silksong is a traditional 2D genre; the rest are 3D co-op; so 2D's commercial strength in 2025–26 is concentrated in long-tail evergreen titles plus occasional sequels.

### Gaps
- No single 2025/2026 source broke out revenue for 2D platformer vs metroidvania vs farming sim; the figures above mix medians, averages and lifetime totals and should not be compared directly.
- No data found on which 2D genres players rate most highly (review-score-by-genre).

---

## Key Question 2: What exact, quantifiable "game feel" parameters do Celeste, Hades, Dead Cells and Hollow Knight use?

### Takeaway
Celeste's values are fully public in its source code and are the best available template (coyote time 0.1 s, variable-jump window 0.2 s, dash 0.15 s with 0.05 s freeze, jump squash/stretch 0.6×1.4, 4-pixel corner correction). No equivalent developer-published numbers were found for Hades, Dead Cells or Hollow Knight; third-party guidance for hitstop converges on 2–10 frames (0.1–0.2 s for heavy hits) and for camera shake on the "trauma^2 or ^3 with Perlin noise" model from Squirrel Eiserloh's GDC talk.

### Cited Findings — Celeste (all from the public source, [Player.cs](https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs); units are pixels at 320x180 and seconds; game logic is 60 Hz)
- Run: MaxRun = 90 px/s; RunAccel = 1000; RunReduce (decel) = 400; AirMult = 0.65 (air control is 65% of ground accel); WalkSpeed = 64; HoldingMaxRun = 70.
- Gravity: Gravity = 900; HalfGravThreshold = 40 (gravity halved near jump apex while |vy| < 40 and jump held); MaxFall = 160; FastMaxFall = 240 (holding down); FastMaxAccel = 300.
- Jump: JumpSpeed = -105; JumpHBoost = 40 (horizontal boost added on jump); VarJumpTime = 0.2 (variable-height window while held); JumpGraceTime = 0.1 (coyote time, 6 frames); CeilingVarJumpGrace = 0.05; UpwardCornerCorrection = 4 px (nudges player around ceiling corners); WallSpeedRetentionTime = 0.06.
- Wall: WallJumpCheckDist = 3 px (wall-jump works 3 px away from wall); WallJumpForceTime = 0.16; WallJumpHSpeed = 130 (MaxRun + JumpHBoost); WallSlideStartMax = 20; WallSlideTime = 1.2.
- Dash: DashSpeed = 240; EndDashSpeed = 160; EndDashUpMult = 0.75; DashTime = 0.15; DashCooldown = 0.2; DashRefillCooldown = 0.1; DashCornerCorrection = 4 px; DashHJumpThruNudge = 6 px; DashVFloorSnapDist = 3 px; DashAttackTime = 0.3; SuperJumpH = 260; SuperWallJumpSpeed = -160; SuperWallJumpH = 170.
- Climb: ClimbMaxStamina = 110; ClimbUpCost = 100/2.2 per s; ClimbStillCost = 10 per s; ClimbJumpCost = 27.5; ClimbUpSpeed = -45; ClimbDownSpeed = 80; ClimbSlipSpeed = 30; ClimbAccel = 900; ClimbCheckDist = 2 px.
- Ducking: DuckCorrectCheck = 4 px; DuckFriction = 500.
- Hitstop (`Celeste.Freeze`): 0.05 s on dash start (skipped if Engine.TimeRate ≤ 0.25), 0.05 s on red-dash start, 0.05 s when exiting a dream block, 0.1 s on explosion launch, 0.01 s on smashing a crystal spinner.
- Squash & stretch (sprite Scale): jump/wall-jump/climb-jump = (0.6, 1.4); bounce = (0.6, 1.4); super bounce = (0.5, 1.5); side bounce = (1.5, 0.5); landing: squish = min(vy / FastMaxFall, 1), Scale.X lerps 1→1.6 and Scale.Y lerps 1→0.4 by squish; recovery approaches (1,1) at 1.75 per second; turning while ducking = (0.8, 1.2).
- Screen distortion: `level.Displacement.AddBurst(Center, 0.4 s, 8→64 px radius, 0.5 strength, QuadOut)` on dash; (0.5 s, 0→80, 0.666) on red dash; (0.3, 0→40) every 0.04 s inside dream blocks; (0.25, 8→32) on feather start/end.
- Camera shake: `DirectionalShake(DashDir, 0.2 s)` on dash; `(0,1), 0.5 s` on temple fall; default-duration shakes on intro landing and feather.
- Particles: dash emits P_DashA/P_DashB every 0.02 s; wall-slide dust every 0.01 s after 65% of slide timer; 8 dust on red dash; 12 feathers on feather start/end; landings emit 12+8+8 (+30 bg on summit).
- Rumble: Strong/Medium on dash and launches; Medium/Short on wall grab; Light/Short in boosters; Climb/Short every 0.2 s while climbing.
- Thorson on jump buffering: "If you press and hold the jump button a short time before landing, you will jump on the exact frame that you land" (frame count not stated) — [Celeste & Forgiveness](https://maddymakesgames.com/articles/celeste_and_forgiveness/index.html)
- A WPI wiki claims Celeste's coyote window is "up to 5 frames" without citation — [WPI DGMI wiki](https://dgmiwiki.wpi.edu/mechanic/coyote_time); the source constant JumpGraceTime = 0.1 s (6 frames at 60 Hz) supersedes this.

### Cited Findings — generic/third-party values (not game-specific)
- Typical coyote and buffer windows: 0.05–0.15 s; one tutorial suggests ~0.12 s coyote; a Unity devlog uses ~0.2 s — [bugnet.io](https://bugnet.io/blog/coyote-time-and-input-buffering-explained); [GMTK Platformer Toolkit devlog](https://gmtk.itch.io/platformer-toolkit/devlog/395523/behind-the-code)
- Hitstop guide: quick jab 2–3 frames; standard attack 4–6; heavy blow 8–10 — [MCO animation guide](https://mocaponline.com/blogs/mocap-news/animation-polish-game-feel-guide)
- Fighting-game (MUGEN) hit-stop grades: 7, 7, 9, 11 frames for A–D — [MUGEN Guild](https://mugenguild.com/forum/topics/trying-apply-proper-hit-stun-and-guard-stun-get-proper-frame-advantages-178274.0.html)
- Controlled study (3D action): optimum hitstop ≈ 0.1–0.2 s; optimum slow-motion ≈ 0.2–0.4 s — [IEICE paper](https://ken.ieice.org/ken/paper/20230315OCSt/eng/)
- Freeze only attacker and target, not global timescale (which freezes UI/audio/FX) — [uhiyama-lab Godot](https://uhiyama-lab.com/en/notes/godot/hit-feedback-hitstop/); [uhiyama-lab Unity](https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/)
- Camera shake model (Squirrel Eiserloh, GDC 2016 "Math for Game Programmers: Juicing Your Cameras With Math"): trauma value 0–1, decays linearly, shake = trauma^2 or ^3, offset driven by Perlin/simplex noise rather than random so it's smooth; apply shake only to the render transform, not gameplay — [Bevy 2D screen shake example](https://bevy.org/examples/camera/2d-screen-shake/); [KidsCanCode Godot recipe](https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/); [three.js port](https://discourse.threejs.org/t/camera-shake-or-much-damage-such-wow/8963)
- Camera follow: direct assignment feels rigid; use lerp / position smoothing — [uhiyama-lab camera](https://uhiyama-lab.com/en/notes/godot/camera2d-techniques/)

### Inferences
- A default "Celeste-class" feel preset for a generator: 60 Hz fixed step; coyote 0.1 s; jump buffer ~0.1 s; variable jump 0.2 s; apex half-gravity; air control 65%; 4 px corner correction; dash freeze 0.05 s; jump stretch (0.6,1.4), land squash up to (1.6,0.4) recovering at 1.75/s; directional camera kick 0.2 s on dash.
- For melee-action games, 3–5 frames light / 8–12 frames heavy hitstop plus trauma-based noise shake is the defensible default given the convergence of the sources.

### Gaps
- No developer-published numeric values for Hades (hitstop, shake), Dead Cells (animation-cancel windows, hit pause) or Hollow Knight (coyote, buffer, camera lerp) were found; Supergiant's GDC talks covered audio and dialogue, not combat feel — [GDC](https://gdconf.com/news/dive-dialogue-hades-gdc-2021).
- Celeste's camera lerp formula lives in `Level.cs`, which was not located in the repo (two path guesses 404'd). Background knowledge [unverified]: Celeste's camera approaches target by `1 - 0.01^dt` style exponential smoothing; Hollow Knight uses Unity with a custom follow camera with lookahead.
- The GMTK Platformer Toolkit devlog, Gigazine Celeste article and Maddy's "Celeste & Forgiveness" page could not be fetched (DNS), so only search-snippet quotes are included.
- "Juice It or Lose It" (Jonasson & Purho, 2012) — the search engine returned only an unrelated diet book; the talk's content (tweening, screenshake, particles, sound layering, hit flash) is widely known but unsourced here.

---

## Key Question 3: What art-style taxonomy lets a user choose a look without naming IP?

### Takeaway
Five families emerge, separable by base resolution, palette discipline, outline/lighting rules, animation method and perspective: (A) 8-bit retro (NES palette, ~400x240-class canvas, hard rules); (B) 16-bit low-res pixel (320x180 canvas, 16–32 px sprites, limited palette, side or top-down); (C) HD pixel art with modern lighting (larger sprites, normal maps/dynamic light, particles, shaders; often 3D-rendered to sprites); (D) painted/illustrated HD 2D (vector-smooth or brush-textured, no pixel grid, animated in-engine or hand-drawn at 24 fps); (E) HD-2D diorama (pixel sprites in 3D scenes with DoF/tilt-shift/bloom).

### Cited Findings
- Base pixel canvas should divide evenly into 1920x1080; 320x180 and 640x360 are the common choices; 320x180 scales by integer multiples to 1080p and 4K, whereas 4:3 bases (320x240) on 16:9 force fractional scaling and shimmer; common sprite sizes 16/32/48 px, each step up costing substantially more art time; decide resolution before any art is made — [bugnet.io resolution guide](https://bugnet.io/blog/choosing-a-pixel-art-resolution-for-your-game)
- Smaller canvases push toward abstract/symbolic art; larger allow detail — [pixnote](https://pixnote.net/en/learn/resolution)
- Family A rules (Shovel Knight): NES palette + 4 extra colours; no sprite flicker; restrained particle counts; Konami-style NES audio; test = "does it still feel like an NES game" — [Game Developer](https://www.gamedeveloper.com/design/breaking-the-nes-for-shovel-knight); [Nintendo Life](https://www.nintendolife.com/news/2015/03/interview_yacht_club_games_talk_drawing_in_8-bit_and_aspirations_for_shovel_knight_64)
- Family B rules (Celeste): 320x180 constant render; prototype on a 16-colour palette chosen for perceived colourfulness — [Steam Community](https://steamcommunity.com/app/504230/discussions/0/3832043350345268297); [CCC transcript](https://static.media.ccc.de/media/conferences/camp2023/camp2023-57155-eng-Celeste_opus.txt)
- Family C rules (Dead Cells): 3D-modelled characters rendered to sprites; hand-painted backgrounds with normal maps; dynamic 3D lighting tints a single asset set per biome; heavy particles/shaders — [80.lv](https://80.lv/articles/interview-with-the-developers-of-dead-cells); [Habr](https://habr.com/post/416589)
- Family D rules (Hollow Knight / Cuphead): hand-drawn, painted look, explicitly not pixel art — [Cohorted](https://app.cohorted.co.uk/news/team-cherry-interview-exploring-the); Cuphead animation at 24 fps on the ones with gameplay at 60 fps — [Unity](https://unity.com/made-with-unity/cuphead); [Inverse](https://www.inverse.com/article/36647-xbox-one-cuphead-animation); Hades/Bastion "lush hand-painted 2D" — [Aidan Moher](https://aidanmoher.com/blog/2014/05/videogames/artwork-jen-zee/)
- Family E rules (HD-2D): pixel sprites + 3D environments + dynamic lighting + depth of field + tilt-shift = diorama; failure modes were "not enough depth → uninteresting" and "too much resolution and saturation → loses pixel-art appeal" — [Wikipedia](https://en.wikipedia.org/wiki/HD-2D); [Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/); camera rotation must be limited to preserve sprite quality — [Unreal interview](https://www.unrealengine.com/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style?lang=en-US)
- Consistency rule across all pixel families: one pixel size per layer; never scale sprites non-integer in-engine; "a health bar with bigger pixels than a frog, which has bigger pixels than the clouds, absolutely ruins the immersion" — [Flowlab forum](https://community.flowlab.io/t/mini-rant-stop-using-mixels/38287); [itch.io feedback](https://itch.io/post/12794454)

### Inferences (proposed taxonomy fields for a style picker — my synthesis)
- `canvas`: 256x224 / 400x240 (A) | 320x180 / 384x216 (B) | 640x360–960x540 virtual with 2–4x sprites (C) | native 1080p+ no grid (D) | native 3D scene with 1x pixel sprites (E).
- `palette`: fixed 54-colour NES-class (A) | 16–32 global colours, hue-shifted ramps (B) | 64–256 colours + lighting-driven tints (C) | unlimited, painterly (D) | sprite palette limited, scene lit in HDR (E).
- `outline`: 1 px dark outline or selective outline (A/B); outlines drop as resolution rises (C); none (D/E).
- `lighting`: none/baked (A/B) | normal-mapped dynamic 2D lights + glow (C) | painted light + bloom/post (D) | full 3D lighting, DoF, bloom (E).
- `animation`: 2–6 frames per action, snappy (A/B) | 8–16+ frames rendered from 3D rigs (C) | 24 fps hand-drawn on ones, or skeletal 2D (D) | sprite frames at low fps against smooth 3D (E).
- `perspective`: side-on platformer, top-down 3/4 (Stardew), isometric (Hades), HD-2D 3/4 with DoF.
- Dead Cells' normal-map trick is the cheapest route for a generator to make pixel art look "modern" (one asset set, infinite recolour via light).

### Gaps
- Pedro Medeiros (saint11) and Slynyrd tutorials could not be fetched; their published rules on outlines, anti-aliasing, hue shifting, sub-pixel animation and smear frames are background knowledge only [unverified].
- Lospec palette guidance not retrieved. Exact palette sizes for Stardew, Celeste's final game, and Dead Cells were not found.
- No developer source gave animation frame counts for Hollow Knight, Hades or Dead Cells.

---

## Key Question 4: What do postmortems say are the common failure points that make indie 2D games look cheap?

### Takeaway
The consistent diagnosis is inconsistency, not budget: mixed asset sources (different pixel densities, cartoon vs realistic, lit vs unlit), lingering placeholder art, and the absence of a written style guide/palette/single visual direction.

### Cited Findings
- Failed Kickstarter team: art came from different creators mixing cartoonish and realistic elements, which "made the project look unfinished and cost it credibility" — [Wayline](https://www.wayline.io/blog/free-art-fatal-kickstarter-failure)
- Mixing high-fidelity PBR assets with low-poly unlit ones looks out of place; free assets produce a "Frankenstein's game" — [Wayline](https://www.wayline.io/blog/frankensteins-game-free-assets-kill-sales)
- Teams keep early art because they're invested, and free enemy art clashing with hand-painted backgrounds was never replaced — [Wayline](https://www.wayline.io/blog/looks-done-isnt-done-polish-first-mistake); [Wayline](https://www.wayline.io/blog/indie-visuals-trap-fake-done-survival)
- "Art direction beats art budget": indie teams blame budget when the real problem is lack of a unified visual direction; fix = short style guide, fixed palette, one visual language early — [bugnet.io](https://bugnet.io/blog/art-direction-beats-art-budget)
- A veteran developer's essay on why his studio's retro games "look like crap" exists but could not be fetched — [Game Developer](https://www.gamedeveloper.com/business/why-all-of-our-games-look-like-crap)
- Mixels (mixed pixel scales) make a game look "like all the sprites were downloaded from different sites"; usually caused by scaling in the engine; only tolerable in a background layer and even then consistent within the layer; acceptable in jams, "amateurish" in a full release — [Flowlab forum](https://community.flowlab.io/t/mini-rant-stop-using-mixels/38287); [itch.io](https://itch.io/post/13713962)
- Over-polishing toward AAA looks is its own failure mode ("The Over-Polished Indie") — [Wayline](https://www.wayline.io/blog/over-polished-indie-killing-indie-spirit)
- HD-2D's own documented failure modes: insufficient depth = uninteresting; over-resolution/over-saturation = loses pixel appeal — [Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/)
- Shovel Knight's counter-example: self-imposed limits (palette, object count, particle restraint) were credited with forcing creativity and coherence — [Game Developer](https://www.gamedeveloper.com/design/breaking-the-nes-for-shovel-knight)

### Inferences
- A generator should enforce invariants rather than hope for taste: one base resolution, integer-only scaling, one global palette (or one per biome derived by lighting), one outline rule, one animation fps, one font family, and a lint pass that rejects assets violating pixel density.
- "Cheap" is mostly a cohesion signal; a deliberately lo-fi but consistent style (Undertale, Vampire Survivors) reads as intentional, while a mismatched high-detail one reads as unfinished.

### Gaps
- Most sources are content-marketing posts or forum threads; no rigorous study was found. Specific postmortems from the reference games (e.g., Hollow Knight, Celeste GDC postmortems) were not retrievable this session.
- UI/typography and audio-design failure points were not covered by any retrieved source (see KQ6 gap).

---

## Key Question 5: Which engines were used, and does it matter for the look?

### Takeaway
Confirmed this session: Unity (Hollow Knight, Cuphead, Sea of Stars, Blasphemous 2, Vampire Survivors post-1.6), GameMaker (Katana ZERO, Pizza Tower, Undertale), Phaser (Vampire Survivors pre-1.6), Unreal Engine 4 (Octopath), custom from-scratch engines (Animal Well; Celeste's C# codebase), Godot (Slay the Spire 2). The spread across engines among equally acclaimed games indicates the engine does not determine the look; the art pipeline and feel constants do. The one engine-adjacent effect found is HD-2D, which depends on a 3D renderer with post-processing (DoF, tilt-shift, bloom).

### Cited Findings
- Hollow Knight: Unity — [Unity](https://unity.com/made-with-unity/hollow-knight)
- Cuphead: Unity — [Unity](https://unity.com/made-with-unity/cuphead)
- Sea of Stars and Blasphemous 2: Unity — [Unity blog](https://unity.com/blog/news/made-with-unity-monthly-roundup-august-2023)
- Vampire Survivors: Phaser → Unity at v1.6 (Aug 17, 2023); Galante later said he would not want to use Unity again after the runtime-fee episode (single secondary source) — [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors); [TechBang](https://www.techbang.com/posts/109967-vampire-survivor-developers-never-use-unity-again)
- Katana ZERO: GameMaker Studio 2 — [Wikipedia](https://en.wikipedia.org/wiki/Katana_Zero)
- Pizza Tower: GameMaker — [Wikipedia](https://en.wikipedia.org/wiki/Pizza_Tower)
- Undertale: GameMaker — [GameDesignSkills](https://gamedesignskills.com/game-design/famous-gamemaker-games)
- Octopath Traveler: Unreal Engine 4 — [Wikipedia HD-2D](https://en.wikipedia.org/wiki/HD-2D)
- Animal Well: custom engine written by Basso — [Wikipedia](https://en.wikipedia.org/wiki/Animal_Well)
- Celeste: C# codebase (public) — [GitHub](https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs)
- Slay the Spire 2: Godot — [GamingOnLinux](https://gamingonlinux.com/2026/03/the-godot-powered-slay-the-spire-2-has-already-hit-over-3-million-sales)
- Dead Cells' look depends on a custom pipeline (3DS Max → FBX → sprite; Photoshop → normal maps; 3D lighting; shaders) rather than on engine choice — [Habr](https://habr.com/post/416589); [80.lv](https://80.lv/articles/interview-with-the-developers-of-dead-cells)

### Inferences
- For a generator, the engine decision should be driven by output target (web/HTML5 = Phaser-like; desktop/console = Godot/Unity-like) and by whether the chosen art family needs 2D normal-mapped lighting (family C) or a 3D post-processing stack (family E); families A, B and D need only a sprite renderer with integer scaling and a shader slot.

### Gaps
- Not confirmed this session [unverified background]: Hades (Supergiant in-house C++), Dead Cells (Haxe/Heaps), Celeste (XNA/FNA), Stardew (XNA/MonoGame), Terraria (XNA), Balatro (LÖVE), Shovel Knight (custom C++), Slay the Spire 1 (libGDX), Ori (Unity), Blasphemous 1 (Unity), Hyper Light Drifter and Hotline Miami (GameMaker), Enter the Gungeon (Unity).

---

## Key Question 6: Level design structure, UI/typography, audio design, and other publicly described team rules

### Takeaway
Very little developer-stated material on level structure, UI/typography or audio was retrievable this session; the few concrete rules found are Shovel Knight's NES-constraint philosophy, Hades' replayability-first and adaptive-narrative goals, Dead Cells' asset-reuse-via-lighting rule, and Cuphead's 24/60 fps split.

### Cited Findings
- Hades: Supergiant won Best Audio at GDCA 2021; Kasavin and Korb's GDC 2021 talk covered preparing the script for voice production and how Early Access feedback shaped narrative — [GDC](https://gdconf.com/news/dive-dialogue-hades-gdc-2021); [Game Developer](https://gamedeveloper.com/audio/dive-into-the-dialogue-of-i-hades-i-at-gdc-2021)
- Kasavin GDC podcast: roguelikes and the value of "dumb" memorable stuff — [GDC podcast](https://gdconf.com/news/roguelikes-and-narrative-design-hades-creative-director-greg-kasavin-gdc-podcast-ep-16)
- Shovel Knight: avoid cluttering the screen with objects; limit particle effects; keep NES rules where they help — [Game Developer](https://www.gamedeveloper.com/design/breaking-the-nes-for-shovel-knight)
- Dead Cells: Motion Twin needed "a pipeline that gave pixel-art results without having to hand draw each and every retake" — [Nintendo Life](https://www.nintendolife.com/news/2018/05/feature_reanimating_the_roguelike_with_dead_cells_developer_motiontwin)
- Hollow Knight process: Ari Gibson met other artists at coffee shops weekly to draw material later used in designs; Unity Asset Browser and "King's Pass black-box layouts" were among donated development materials (museum article) — [Red Bull](https://www.redbull.com/us-en/hollow-knight-nintendo-interview)
- Cuphead: separate animation clock (24 fps) from simulation clock (60 fps) — [Unity](https://unity.com/made-with-unity/cuphead)
- Slay the Spire: slow start (2,200 sales in two days), growth via streamers and the China market — [Game Developer](https://gamasutra.com/business/after-a-worrisome-start-i-slay-the-spire-i-has-sold-more-than-1-5-million-copies)
- Pizza Tower and Katana ZERO both built audiences via public demos/Patreon builds before launch — [Wikipedia Pizza Tower](https://en.wikipedia.org/wiki/Pizza_Tower); [Nintendo Life](https://www.nintendolife.com/news/2019/04/katana_zero_sold_more_than_100000_copies_in_its_first_week)

### Inferences
- The long-tail hits share "live" structure: Dead Cells' 34 free updates, Stardew's 1.6 update doubling 2024 sales, Terraria's 15 years of updates. A generator targeting commercial outcomes should make content extension cheap (biome recolours via lighting, data-driven items/cards).

### Gaps
- No retrievable developer statements on UI/typography rules (font choice, pixel fonts, menu motion) for any reference game.
- No audio-design rules (SFX layering, hit-sound timing, adaptive music) retrieved beyond Hades' audio awards and Shovel Knight's Konami-style chip emulation.
- No level-design structure data (room sizes, screen counts per chapter, metroidvania gating density) retrieved; Celeste's chapter/room structure and Hollow Knight's map data are background knowledge only.
- GDC Vault talks (Celeste movement, Dead Cells "Nine-Month" design talks, Hollow Knight) were not accessible via this session's tooling.
