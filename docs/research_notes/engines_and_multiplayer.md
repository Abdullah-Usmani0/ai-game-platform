# Engines and multiplayer runtimes for AI-generated 2D web games (state as of 2026-10-27)

Method note: phaser.io, docs.godotengine.org, summerengine.com, agentpatterns.ai and GitHub's API were unreachable from this sandbox (proxy policy), and the shared web-search budget ran out mid-research. Findings below therefore combine (a) web-search result summaries of primary/secondary pages, and (b) first-hand measurements taken from the npm registry (registry.npmjs.org was reachable): version/date/license metadata and minified+gzip sizes measured directly from the published tarballs on 2026-10-27. Where a number is "measured", it is mine; where it is "claimed", it is from the cited page.

## Key Question 0: Candidate-by-candidate comparison (maturity, web performance, 2D features, LLM suitability, licensing, mobile)

### Takeaway
Phaser 4 (released April 2026, now 4.2.1) is the only candidate that simultaneously has a current major release, a full batteries-included 2D feature set (tilemaps, Arcade + Matter physics, particles, a new filter/lighting system), first-party TypeScript definitions, a headless render mode, a measured ~345 KB gzip footprint, MIT licensing, and (new in v4) an official, in-package set of 27 "AI agent skills" written for coding agents. PixiJS 8 is the strongest renderer (WebGL + WebGPU, 231 KB gzip) but has no game layer; Godot 4 web export is viable but ships ~35-50 MB by default; the WASM/native engines (Unity, Bevy, LÖVE, GameMaker) are poor fits for instant-play, LLM-authored, remixable browser games.

### Cited Findings

**Summary matrix (versions/dates/sizes verified on npm or crates.io on 2026-10-27 unless marked "claimed")**

| Runtime | Latest stable (date) | License | Measured min bundle (raw / gzip) | TS types in package | Notes |
|---|---|---|---|---|---|
| Phaser | 4.2.1 (2026-07-09) | MIT | phaser.min.js 1,344 KB / 344 KB; phaser-arcade-physics.min.js 1,237 KB / 312 KB | yes (bundled `types/phaser.d.ts`) | [npm](https://www.npmjs.com/package/phaser) |
| PixiJS | 8.22.0 (2026-10-01) | MIT | pixi.min.js 821 KB / 231 KB; separate `webworker.min.js` 847 KB / 244 KB | yes | [npm](https://www.npmjs.com/package/pixi.js) |
| Excalibur | 0.32.0 (2025-12-23); `next` 0.33.0-alpha.283 | BSD-2-Clause | build/dist/excalibur.min.js 560 KB / 144 KB | yes | [npm](https://www.npmjs.com/package/excalibur) |
| KAPLAY | 3001.0.19 (2025-06-15); `next` 4000.0.0-alpha.27.1 (2026-05-12) | MIT | kaplay.mjs 184 KB / 68 KB | yes | [npm](https://www.npmjs.com/package/kaplay) |
| Kaboom (predecessor) | 3000.1.17 (2023-11-13), marked deprecated | MIT | - | yes | [npm](https://www.npmjs.com/package/kaboom) |
| Bevy (Rust) | crate 0.20.0 (current on crates.io index) | (not verified here) | no measurement possible without a build | n/a (Rust) | [crates.io index](https://index.crates.io/be/vy/bevy) |
| matter-js | 0.20.0 (2024-06-23) | MIT | matter.min.js 82 KB / 25 KB | no `types` field | [npm](https://www.npmjs.com/package/matter-js) |
| planck (Box2D port, TS) | 1.5.1 (2026-10-12) | MIT | planck.min.js 290 KB / 54 KB | yes | [npm](https://www.npmjs.com/package/planck) |
| @dimforge/rapier2d-compat | 0.21.0 (2026-09-25) | Apache-2.0 | rapier.mjs 3,330 KB / 1,259 KB incl. inlined wasm; raw wasm 2,348 KB / 885 KB | yes | [npm](https://www.npmjs.com/package/@dimforge/rapier2d-compat) |
| box2d-wasm | 7.0.0 (2021-11-28) | Zlib | Box2D.wasm 158 KB / 73 KB | yes | [npm](https://www.npmjs.com/package/box2d-wasm) |
| bitecs (ECS) | 0.4.0 (2025-12-06) | MPL-2.0 | core/index.min.mjs 16 KB / 6 KB | yes | [npm](https://www.npmjs.com/package/bitecs) |
| miniplex (ECS) | 2.0.0 (2023-07-16) | MIT | - | yes | [npm](https://www.npmjs.com/package/miniplex) |
| love.js (Davidobot fork) | 11.4.1 (2022-08-25) | MIT | - | no | [npm](https://www.npmjs.com/package/love.js) |

**Phaser 4 / 3**
- Phaser v4.0.0 "Caladan" shipped 10 April 2026, described by the team as the framework's biggest release, with a new renderer, filters, lighting and GPU-powered objects; v4.1.0 "Salusa" followed on 30 April 2026 — [phaser.io stable download](https://phaser.io/download/stable); [gamedev.net](https://gamedev.net/news/2759-phaser-4-released/)
- v4.2.1 "Giedi" (9 July 2026) was a bug-fix patch covering stencil rendering, an ESM build breakage, tweens and ScaleManager — [gamedev.net](https://gamedev.net/news/4825-phaser-v421-released/)
- The 4.2.1 README states the full `phaser.min.js` is 1.29 MB raw / 345 KB gzip and `phaser-arcade.min.js` is 1.18 MB / 313 KB; the 8.23 MB unminified file is 84% JSDoc. My tarball measurement matches (1,344 KB / 344 KB gzip; arcade build 1,237 KB / 312 KB) — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md)
- v4 replaced the v3 pipeline with a node-based WebGL renderer with managed state, built-in context restoration, index-buffered quads (one-third fewer vertex uploads), smarter multi-texture batching for mobile and just-in-time rendering — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md)
- v4 unified FX and masks into a single Filter system applicable to any game object or camera, shipping Blur, Glow, Shadow, Pixelate, ColorMatrix, Bloom, Vignette, Wipe, ImageLight (image-based lighting), Blocky, GradientMap, Quantize, Key (chroma), NormalTools and Blend (27 canvas blend modes in WebGL); masks are filters; a new `SpriteGPULayer` targets "a million sprites" — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md)
- Built-in feature list per README: scene architecture, loader, Arcade and Matter.js physics, animation, input, cameras, tilemaps, particles, tweens; 2,000+ examples; "first-class TypeScript definitions"; `create-phaser-game` scaffolds Vue/React/Angular/Next/Solid/Svelte/Remix with Vite/Rollup/Parcel/Webpack/ESBuild/Bun in JS and TS — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md)
- The README has an explicit "AI-ready" bullet: "Phaser's API is well understood by every major frontier LLM. This repository includes a comprehensive set of AI agent skills (skills/)". The published 4.2.1 npm tarball contains a `skills/` directory with 27 `SKILL.md` files (scenes, physics-arcade, physics-matter, tilemaps, particles, filters-and-postfx, input-keyboard-mouse-touch, scale-and-responsive, v3-to-v4-migration, v4-new-features, etc.) plus 8 `REFERENCE.md` files, each with a YAML front-matter trigger description — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md) (skills directory observed in the npm tarball at [npm phaser](https://www.npmjs.com/package/phaser))
- Renderer target: the shipped 4.2.1 `WebGLRenderer.js` requests `canvas.getContext('webgl')` / `experimental-webgl` and then makes "WebGL2 core features which were extensions available on the WebGL1 context", i.e. Phaser 4 is a WebGL1-based renderer with WebGL2 features polyfilled through extensions; it does not use WebGPU — source observed in the [npm phaser 4.2.1 tarball](https://www.npmjs.com/package/phaser). This matches Phaser devlog 235, which said WebGL2 was "effectively dead" for them and described a revised WebGL1 renderer with WebGPU only as a longer-term plan — [phaser.io devlog 235](https://www.phaser.io/devlogs/235)
- Headless: `Phaser.HEADLESS = 3` render type exists ("meant for unit testing, not for running Phaser on the server") — observed in `src/const.js` of the [npm phaser 4.2.1 tarball](https://www.npmjs.com/package/phaser). `@geckos.io/phaser-on-nodejs` 1.3.1 (2025-06-24, MIT) runs Phaser headless on Node via jsdom + canvas, for Arcade/Matter server simulation — [npm](https://www.npmjs.com/package/@geckos.io/phaser-on-nodejs)
- Phaser is "commercially developed and maintained by Phaser Studio Inc" — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md)
- npm metadata: first published 2014-02-17, 176 versions, sole runtime dependency `eventemitter3`, MIT — [npm](https://www.npmjs.com/package/phaser)
- Phaser's April 2026 comparison (same Sonic-style runner built in Phaser, KAPLAY and Excalibur by JSLegendDev; note it is published by Phaser) rates Phaser strongest on performance/stability incl. Safari, says Phaser supports headless mode for server-side multiplayer and KAPLAY/Excalibur do not, and claims AI tools answer more accurately for Phaser with hallucinations more common for KAPLAY and Excalibur — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)
- A Phaser-focused community "game-qa" agent skill (Playwright fixture that waits for a global game flag) exists in public skill registries — [skills.cat game-qa](https://skills.cat/skills/opusgamelabs/game-creator/game-qa)
- Ecosystem: `phaser3-rex-plugins` 1.80.20 (2026-03-31, MIT) still ships (UI, behaviours) — [npm](https://www.npmjs.com/package/phaser3-rex-plugins)

**PixiJS 8 (+ custom ECS)**
- README: "WebGL & WebGPU Renderers", asset loader, "Easy to use, yet powerful API"; v8 uses a single import root for tree-shaking and loads renderer code via dynamic import so only the needed renderer is fetched — [npm pixi.js](https://www.npmjs.com/package/pixi.js); [pixi v8 beta blog](https://pixijs.com/blog/pixi-v8-beta)
- v8.20.0 added render bundles, view caching and a Safari WGSL fallback for the WebGPU path — [gamedev.net](https://gamedev.net/news/5221-pixijs-v8200-released/)
- Measured 8.22.0: `pixi.min.js` 821 KB raw / 231 KB gzip; a dedicated `webworker.min.js` build (847 KB / 244 KB) exists for OffscreenCanvas/worker rendering — [npm](https://www.npmjs.com/package/pixi.js). A third-party claim of "about 450 KB minified, a third the size of Phaser" is contradicted by these measurements (Pixi min is ~61% of Phaser min raw, 67% gzipped) — [abratabia.com](https://abratabia.com/pixijs/)
- No built-in physics, tilemaps, scenes or input abstraction; add-ons: `@pixi/tilemap` 5.0.2 (2025-07-14, WebGPU + Canvas), `pixi-filters` 6.1.5 (2025-11-29), `@pixi/react` 8.0.5 — [npm @pixi/tilemap](https://www.npmjs.com/package/@pixi/tilemap); [npm pixi-filters](https://www.npmjs.com/package/pixi-filters)
- ECS options: `bitecs` 0.4.0 (2025-12-06, MPL-2.0, 6 KB gzip core); `miniplex` 2.0.0 last published 2023-07-16 — [npm bitecs](https://www.npmjs.com/package/bitecs); [npm miniplex](https://www.npmjs.com/package/miniplex)
- Bitmagic's platform is described by a 2026 comparison as "a custom WebGL engine (TypeScript + Three.js)", i.e. an example of the custom-framework route in production — [seeles.ai comparison](https://www.seeles.ai/compare/seele-vs-bitmagic)

**Excalibur.js**
- "Your friendly TypeScript 2D game engine for the web", built from the ground up for TypeScript; BSD-2-Clause — [excaliburjs.com](https://excaliburjs.com/)
- README warns it is "still in version 0.x ... may be a little rough around the edges" and points to a 1.0 roadmap issue — [npm excalibur README](https://www.npmjs.com/package/excalibur)
- Latest stable 0.32.0 (2025-12-23); 2,140 published versions (nightly alphas); measured min 560 KB / 144 KB gzip; Tiled plugin `@excaliburjs/plugin-tiled` 0.32.0 — [npm](https://www.npmjs.com/package/excalibur); [npm plugin-tiled](https://www.npmjs.com/package/@excaliburjs/plugin-tiled)
- Aggregator: last repo push 26 April 2026, 47 open issues — [gittrend.io](https://gittrend.io/repo/excaliburjs/Excalibur)
- Phaser's comparison: closest to Phaser in approach, more concise API, good browser-extension debugger, but needed more manual work and has no headless mode — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)

**KAPLAY (ex-Kaboom)**
- Kaboom's npm package is deprecated: "Kaboom is no longer maintained. Please use KAPLAY"; Replit no longer maintains Kaboom — [npm kaboom](https://www.npmjs.com/package/kaboom); [github replit/kaboom mirror](https://fr.github.com/replit/kaboom)
- KAPLAY stable is still the 3001 line (3001.0.19, 2025-06-15); the 4000 line has been in alpha since at least alpha.22 (2025-10-09) through alpha.27.1 (2026-05-12), and its changelog marks breaking changes (e.g. `onClick(() => {})` removed in favour of `onMousePress()`), adds `maxTimeStep`/`fixedUpdateMode` (alpha.24, 2025-12-12) and "TypeScript Advanced Features" typing config (alpha.22) — CHANGELOG.md in the [npm kaplay 4000.0.0-alpha.27.1 tarball](https://www.npmjs.com/package/kaplay)
- Component-composition API with global functions (`add([sprite(), pos(), area(), body(), health()])`), a web editor (KAPLAYGROUND) with 90+ examples; measured 184 KB / 68 KB gzip, the smallest full game library here — [npm kaplay README](https://www.npmjs.com/package/kaplay)
- Phaser's comparison calls it easiest to learn, suited to jams/prototypes, with performance limits likely on larger projects — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)

**Godot 4 (web export)** — see Key Question 6 for detail.
- Default 4.4-era web export ~42 MB; a custom export template with Brotli reaches ~2.7 MB; web size "mostly unchanged in 4.5" — [popcar guide](https://popcar.bearblog.dev/how-to-minify-godots-build-size/)
- A tutorial estimates 35-50 MB total with a ~30 MB engine wasm — [viblo.asia](https://viblo.asia/p/xuat-godot-4-sang-web-html5-huong-dan-thuc-te-va-4-loi-hay-gap-7Z4DEGBwJnX)
- Godot 4.7 reportedly shipped 19 June 2026 with wasm64 web builds, still rendering via WebGL 2.0 Compatibility renderer (secondary source) — [cinevva news](https://app.cinevva.com/pt-BR/news/2026-06-19-godot-4-7-released)

**Defold**
- Defold 1.13.0 (June 2026; Defold says 22 June, Wikipedia 29 June) removed asm.js so HTML5 is WebAssembly-only, exposed almost all of Box2D v3 (chains, joints, shapes, AABBs) via a Lua API, with Box2D v3 initially opt-in via app manifest — [Defold H1 2026](https://defold.com/2026/06/30/Defold-H1-2026/); [Wikipedia](https://en.wikipedia.org/wiki/Defold)
- Empty HTML5 project is about 1.06 MB per a Defold developer; 2026 guides cite ~1.14 MB and "loads fastest" — [html5gamedevs](https://www.html5gamedevs.com/topic/73554-defold-1130-has-been-released/); [cinevva engine comparison](https://app.cinevva.com/guides/web-game-engines-comparison)
- Defold is among the official Colyseus SDK targets — [docs.colyseus.io](https://docs.colyseus.io/recipes)

**Unity 6 Web**
- Unity 6.6 (1 September 2026) makes WebGPU fully supported (WebGL2 remains the default), adds Graphics Device Filtering, Wasm64 up to 16 GB (Chrome/Edge 128+, Firefox 129+) and Progressive Asset Loading — [cinevva Unity 6.6 news](https://app.cinevva.com/news/2026-09-01-unity-6-6-webgpu-production)
- Mobile-browser support for web builds arrived with Unity 6 (announced Dec 2023) — [gamemakers.jp](https://gamemakers.jp/article/2023_12_04_56453/)
- Minimum empty web builds: 3.32 MiB (automated URP measurement), 3.38 MB built-in / 7.91 MB URP on 6000.0.40f1; guides quote 8-11 MB typical — [Unity discussions](https://discussions.unity.com/t/smallest-possible-webgl-build-size/917019/10); [Unity discussions memory thread](https://discussions.unity.com/t/web-build-memory-consumption-on-unity-6/1613334); [cinevva](https://app.cinevva.com/guides/unity-alternatives-web-games)

**GameMaker**
- Current LTS is GameMaker LTS 2026.0 (21 May 2026) — [Wikipedia](https://en.wikipedia.org/wiki/GameMaker)
- Free tier is non-commercial; a $99.99 one-time Commercial/Professional licence includes HTML5 and GX.games exports; a Nov-2023 runtime licence page says GX.games is free for commercial use — [gamemaker.io get](https://gamemaker.io/get); [licence help article](https://gamemaker.io/help/articles/how-to-upgrade-your-gamemaker-licence); [runtime licence](https://gamemaker.io/legal/gamemaker-runtime-licence-free)
- GX.games target outputs a WebAssembly runner; the legacy HTML5 export is pure JS; Wavedash recommends GX.games even off Opera GX — [Wavedash GameMaker guide](https://docs.wavedash.com/engines/gamemaker)

**Bevy (Rust/WASM)**
- crates.io index currently lists bevy 0.20.0 — [crates.io index](https://index.crates.io/be/vy/bevy)
- A `2d` feature profile only arrived in 0.18; Bevy CLI offers `web-release` profiles with `opt-level = "z"` because "binary size is a lot more important for web apps" — [bevy_cli](https://github.com/christopherbiscardi/bevy_cli); [bevy features template](https://git.adamlamers.com/PublicArchive/bevy/src/branch/main/docs-template/features.md.tpl)
- An indie dev: "build times and binary sizes are still my biggest pain points" (no figures) — [itch.io devlog](https://meapps.itch.io/terminal-colony-deep-core/devlog/1014345/taming-wasm-autosave-rng-and-bevy-builds)

**LÖVE via love.js**
- The maintained web path is 2dengine's player, an Emscripten build of LÖVE 11.5; it needs special HTTP headers and is slower because it cannot use LuaJIT; the LÖVE 12.0 wiki still says "currently not released"; the Davidobot npm fork was last published 2022-08-25 — [Wavedash LÖVE](https://docs.wavedash.com/engines/love2d); [2dengine/love.js](https://github.com/2dengine/love.js); [love2d wiki 12.0](https://www.love2d.org/wiki/12.0); [npm love.js](https://www.npmjs.com/package/love.js)

**Construct 3**
- TypeScript coding inside the editor arrived in beta r433 (April 2025) on a Monaco-based editor; official type definitions for all Construct APIs were introduced in r361 — [gamefromscratch](https://gamefromscratch.com/?p=10797); [construct.net r361](https://animate.construct.net/r361)
- Forum users report AI tools were "of doubtful use" with Construct 3 (anecdotal) — [construct.net forum](https://construct.net/en/users/418439/1mrpaul1/forum-posts/page-3)

**Plain Canvas/WebGL + custom framework**
- Bitmagic runs on a custom AI-first engine (custom WebGL, TypeScript + Three.js) — [seeles.ai](https://www.seeles.ai/compare/seele-vs-bitmagic); [getcoai](https://getcoai.com/news/bitmagic-secures-4m-for-text-to-3d-game-platform)
- Phaser's own devlog notes a Canvas renderer "can easily be significantly smaller in size than even the most streamlined WebGL one" — [phaser.io devlog 225](https://phaser.io/devlogs/225)

**Physics determinism**
- Rapier's standard npm builds "do not guarantee cross-platform determinism"; the `-deterministic` variants (e.g. `@dimforge/rapier2d-deterministic` 0.21.0, 2026-09-25) do, at some performance cost; inputs must avoid `Math.sin`/`Math.cos` which differ across platforms — [rapier.rs determinism](https://rapier.rs/docs/user_guides/javascript/determinism); [npm rapier2d-deterministic](https://www.npmjs.com/package/@dimforge/rapier2d-deterministic)
- Matter.js has not published since 0.20.0 (2024-06-23) — [npm matter-js](https://www.npmjs.com/package/matter-js)

### Inferences
- For instant-play (sub-second first paint on mobile), only the JS engines (Phaser ~345 KB gz, Pixi ~231 KB gz, Excalibur ~144 KB gz, KAPLAY ~68 KB gz) and Defold (~1 MB) are in range; Godot (35-50 MB default) and Unity (3-11 MB) are at least an order of magnitude heavier and need custom templates/compression to approach them.
- Phaser 4's renderer being WebGL1-with-extensions is a pragmatic compatibility choice (Safari/iOS), not a performance ceiling for 2D; its new `SpriteGPULayer` and filter pipeline cover the "lighting/shaders/particles" bar. PixiJS is the only JS option with a production WebGPU path, which matters little for 2D platformers today.
- Physics for generated games: Phaser's Arcade (AABB, deterministic enough for platformers, included in the 312 KB gz build) is the default; Matter is bundled but unmaintained upstream since mid-2024; Rapier 2D adds ~0.9-1.3 MB gzip of wasm, too heavy for instant-play unless lazily loaded; `planck` (TS Box2D, 54 KB gz, released Oct 2026) is the lightest actively maintained rigid-body option if Matter is insufficient.
- KAPLAY's smallest-and-simplest API is attractive for LLMs but the 4000 line has been in alpha for 12+ months with breaking changes, so training data (mostly Kaboom/3001 era) will drift from the shipped API; Excalibur is still 0.x with an explicit "rough edges" warning. Both lack a headless mode for server-side simulation.

### Gaps
- No independent, reproducible 2025-2026 benchmark comparing Phaser 4 vs PixiJS 8 vs Godot web sprite throughput was found (search budget ran out before this query ran).
- Phaser 3.x maintenance/LTS status after v4 is unconfirmed (phaser.io unreachable).
- GitHub star/commit counts could not be retrieved (GitHub API blocked in this sandbox); npm download counts likewise (api.npmjs.org unreachable).
- Bevy wasm binary size for a 2D sample, Bevy licence, Defold licence terms, Unity Web licensing and Construct 3 pricing were not verified.

## Key Question 1: Which engine do existing AI game platforms use, and why?

### Takeaway
Browser-first platforms converge on Phaser for 2D (Rosebud), Three.js or custom TypeScript/WebGL for 3D (Rosebud, Bitmagic), while desktop-oriented AI editors (Summer Engine, Orca Engine) wrap Godot 4; Ludo.ai is pre-production tooling rather than an engine; Google Playground (Oct 2026) has not disclosed its runtime; Replit's historic game template is Kaboom (its own, now abandoned, library).

### Cited Findings
- Rosebud: Phaser's own news says all 2D games on Rosebud's play site run on Phaser; Rosebud calls Phaser "a key component" and generates Phaser code from plain-language descriptions; its FAQ says 3D uses WebGL/Three.js, and a blog post shows prompting "Rosie" to port a Phaser game to Three.js — [phaser.io news 2024](https://phaser.io/news/2024/01/create-phaser-games-from-prompts-with-rosebud-ai); [Rosebud blog](https://lab.rosebud.ai/blog/publish-your-phaser-game-on-rosebud); [Rosebud three.js editor](https://lab.rosebud.ai/ai-website-builder-three-js-editor)
- Rosebud output is browser-only HTML5, no Steam export, "no real 3D" per Summer Engine's (competitor) roundup — [summerengine.com](https://www.summerengine.com/blog/best-ai-game-engines-2026)
- Bitmagic: "Bitmagic Game Engine ... designed from ground up to be an AI-first game development platform"; a 2026 comparison says it is a custom WebGL engine in TypeScript + Three.js; 3D-focused, waitlist access — [aipressroom](https://aipressroom.beehiiv.com/p/bitmagic-launches-public-test-for-ai-based-tool-to-create-games-with-text-prompts); [seeles.ai](https://www.seeles.ai/compare/seele-vs-bitmagic)
- Astrocade: generative platform merging NLP with no-code design tools; July 2025 press release describes an AI brainstorming flow, a per-game generated edit mode, and remix features; no engine disclosed in sources found — [natlawreview press release](https://natlawreview.com/press-releases/astrocade-rolls-out-ai-agent-powered-game-creation-experience-opening-door)
- Ludo.ai: "does not create playable games or prototypes"; focuses on research/ideation/asset generation plus a Unity code-generation tool for foundational scripts — [ludo.ai FAQ](https://ludo.ai/faq)
- Summer Engine: "a Godot 4 compatible desktop editor with AI tools for scene edits and playtests", with an MCP server for external agents; projects open in vanilla Godot; it ranks itself first in its own roundups; Orca Engine is another Godot-4-based AI editor — [summerengine.com godot-ai-suite](https://www.summerengine.com/blog/godot-ai-suite); [Summer vs Orca](https://www.summerengine.com/blog/summer-vs-orca-engine.md)
- Google Playground (Google Labs, launched 7 Oct 2026): describe a game in natural language, get a playable browser version; templates for racing, quizzes, tower defense; uses Gemini, Nano Banana and Lyria plus "a custom system refined using internally developed games and evaluations"; US adults only, waitlist for free users; Unity is a partner building "Unity Spark" (closed beta planned). No runtime/engine disclosed — [gamedeveloper.com](https://www.gamedeveloper.com/business/google-debuts-new-ai-game-platform-named-google-playground); [godisageek](https://godisageek.com/2026/10/google-playground-text-prompts-browser-games/)
- Replit: its Kaboom template shipped kaboom2000 with TypeScript support and an assets library; Replit built Kaboom and later stopped maintaining it (community fork: KAPLAY); a third party lists Phaser.js as another Replit game template — [Replit blog kaboom2000](https://blog.repl.it/kaboom2000); [github replit/kaboom](https://fr.github.com/replit/kaboom); [arsturn](https://arsturn.com/blog/using-replit-for-game-development-a-new-frontier)
- An AI-roundtable answer argues code-first text-based engines (Godot, Pygame, Phaser) suit LLM agents better than node-graph engines like Unreal Blueprints (weak source) — [opper.ai](https://opper.ai/ai-roundtable/questions/best-game-engine-framework-to-use-with-llm-coding-agents-3cb2c917)

### Inferences
- The split is by delivery target: anything that must be instantly playable and remixable in a browser tab picks a JS engine (Phaser for 2D), whereas tools that produce downloadable/Steam games wrap Godot. For a browser-first 2D platform, Rosebud's Phaser choice is the direct precedent.
- Rosebud's "port Phaser to Three.js" workflow shows the LLM-facing cost of two engines; standardising on one 2D engine reduces prompt/skill maintenance.

### Gaps
- Astrocade's and Google Playground's runtime engines are undisclosed in the sources found; Astrocade's Hashnode engineering blog could not be fetched.
- Rosebud has published no architecture doc on sandboxing, bundling or versioning of the Phaser runtime.

## Key Question 2: Which engine has the best guard rails for an LLM (types, surface area, deterministic loop, headless testability, hot reload)?

### Takeaway
Phaser 4 offers the most complete guard-rail package today: bundled `.d.ts` types, an in-package set of 27 agent skills including a v3-to-v4 migration skill (directly addressing API drift between training data and the shipped version), a `HEADLESS` render type plus a Node headless runner, and a 13-year-stable scene/update API. KAPLAY has the smallest surface area and a `fixedUpdateMode` but an unstable (alpha) major version; Excalibur is TypeScript-native but 0.x; PixiJS has excellent types but no game loop conventions, so an in-house framework would have to supply the guard rails.

### Cited Findings
- Phaser 4.2.1 ships bundled TypeScript definitions (`types/phaser.d.ts`), and its `renderType` config accepts `CONST.CANVAS`, `CONST.WEBGL`, `CONST.HEADLESS` or `CONST.AUTO`; HEADLESS has "a special version of the Game Step" — observed in the [npm phaser 4.2.1 tarball](https://www.npmjs.com/package/phaser)
- Phaser 4.2.1 bundles 27 agent `SKILL.md` files with front-matter triggers (e.g. "Use this skill when working with Phaser 4 utility functions, actions, alignment, grid layout...") and `REFERENCE.md` files for cameras, components, input, loading, particles, scenes, sprites and v4 features — observed in the [npm phaser 4.2.1 tarball](https://www.npmjs.com/package/phaser); README: [unpkg](https://unpkg.com/phaser@4.2.1/README.md)
- Phaser's comparison claims AI tools answer more accurately for Phaser than KAPLAY/Excalibur (vendor claim) — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)
- `@geckos.io/phaser-on-nodejs` 1.3.1 (2025-06-24) provides headless Phaser on Node (jsdom + canvas), enabling Arcade/Matter simulation server-side or in CI — [npm](https://www.npmjs.com/package/@geckos.io/phaser-on-nodejs)
- KAPLAY 4000 alpha.24 added `maxTimeStep` and `fixedUpdateMode` options; alpha.22 added `KAPLAYOpt.types`/`kaplayTypes()` typing configuration; the 4000 line contains marked breaking changes — [npm kaplay changelog (4000.0.0-alpha.27.1)](https://www.npmjs.com/package/kaplay)
- Excalibur: "built from the ground up for TypeScript" but "still in version 0.x" — [excaliburjs.com](https://excaliburjs.com/); [npm README](https://www.npmjs.com/package/excalibur)
- Excalibur has a browser-extension debug mode praised in Phaser's comparison — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)
- Construct 3 only gained in-editor TypeScript in April 2025 (r433) and forum users report AI tooling of "doubtful use" — [gamefromscratch](https://gamefromscratch.com/?p=10797); [construct.net forum](https://construct.net/en/users/418439/1mrpaul1/forum-posts/page-3)
- Summer Engine exposes Godot to agents via an MCP runtime bridge that can inspect/edit scenes, run the game and read diagnostics, but only inside its desktop editor — [summerengine.com](https://www.summerengine.com/blog/godot-ai-suite)
- TypeScript 7.0.2 (2026-07-08) is current on npm — [npm typescript](https://www.npmjs.com/package/typescript)

### Inferences
- "Training data volume" strongly favours Phaser (2014-era npm history, 2,000+ examples, 176 releases) and PixiJS (820 npm versions since 2014); the catch is v3-vs-v4 drift, which Phaser mitigates with the shipped migration skill. A platform should pin one Phaser 4.x minor and inject the matching skills into the agent context.
- Surface-area control is best achieved by wrapping, not by picking the smallest library: a thin platform SDK over Phaser (one fixed scene template, fixed-timestep update, seeded RNG, exposed state) gives KAPLAY-like simplicity with Phaser's stability.
- Hot reload: all JS engines reload via Vite/ESBuild in milliseconds; Godot/Unity/Bevy require export/compile cycles of seconds to minutes, which multiplies agent iteration cost.

### Gaps
- No source quantified LLM accuracy per engine beyond Phaser's own (interested) claim; no public eval of code-generation pass rates by engine was found.
- Whether Phaser 4 exposes an official deterministic/fixed-timestep mode (beyond Arcade's `fixedStep`) was not verified from docs.

## Key Question 3: Best way to let an agent see and test a running game

### Takeaway
Practitioner skills converge on a small protocol: expose `window.advanceTime(ms)` (deterministic stepping) and `window.render_game_to_text()` (state as text) from the game, drive it with Playwright (`page.clock.install()` + `runFor()`), take screenshots the agent actually inspects, and re-run headed when WebGL capture looks wrong; Phaser's HEADLESS mode and Node runner cover logic tests without a browser.

### Cited Findings
- OpenAI's curated "develop-web-game" skill (mirrored widely): provide a single canvas and `window.render_game_to_text` so the test loop can read state; expose a time-stepping hook such as `window.advanceTime(ms)` to avoid flaky tests; for frame-precise control in `@playwright/test` prefer `page.clock.install()` + `page.clock.runFor()`; if a headless/WebGL capture issue is suspected, rerun headed; the agent must open and visually check screenshots, capturing states beyond the start screen — [openai develop-web-game skill](https://skills.cat/skills/trailofbits/skills-curated/openai-develop-web-game); [mcpservers.org mirror](https://mcpservers.org/agent-skills/firecrawl/openai-skills/develop-web-game)
- A Phaser-specific "game-qa" skill sets up `@playwright/test` with a fixture that waits for a global game-ready flag — [skills.cat game-qa](https://skills.cat/skills/opusgamelabs/game-creator/game-qa)
- Phaser's `HEADLESS` render type is "meant for unit testing" — [npm phaser 4.2.1 tarball, src/const.js](https://www.npmjs.com/package/phaser); `@geckos.io/phaser-on-nodejs` runs Phaser under Node with jsdom/canvas — [npm](https://www.npmjs.com/package/@geckos.io/phaser-on-nodejs)
- `@playwright/test` is at 1.64.1 (2026-10-14) — [npm](https://www.npmjs.com/package/@playwright/test)
- Rapier's determinism guide: snapshots hashed with MD5 should match across machines after the same number of steps, provided the deterministic build is used and inputs avoid platform-dependent transcendental functions — [rapier.rs](https://rapier.rs/docs/user_guides/javascript/determinism)
- Summer Engine's MCP bridge lets an agent run the game and read diagnostics inside Godot's editor (desktop only) — [summerengine.com](https://www.summerengine.com/blog/godot-ai-suite)
- PixiJS ships a dedicated `webworker` build (measured 847 KB / 244 KB gz), i.e. rendering can run off the main thread via OffscreenCanvas — [npm pixi.js](https://www.npmjs.com/package/pixi.js)

### Inferences
- A platform-level harness should mandate, in the generated code: (1) a fixed-timestep update driven by an injectable clock, (2) a seeded PRNG (never `Math.random`), (3) `window.__game.state()` returning a JSON snapshot and `window.__game.step(n)`, (4) a replayable input log; this makes Playwright runs deterministic and lets the agent assert on state rather than pixels, using screenshots as a secondary visual check.
- Canvas pixel readback (`toDataURL`/`readPixels`) works in headless Chromium but WebGL via SwiftShader can diverge from GPU output, hence the "re-run headed" advice; state-as-text is the primary oracle.

### Gaps
- No measured data on Playwright headless WebGL screenshot flakiness rates or on SwiftShader vs ANGLE differences was gathered (search budget exhausted before that query).

## Key Question 4: A sane multiplayer story for generated games

### Takeaway
Pick one pattern and bake it into every generated game: an authoritative Colyseus room (TypeScript on both sides, schema state sync, server tick) with the client using Colyseus 0.18's built-in prediction layer (lerp/dead-reckoning for remote entities, server-reconciled rollback for the local player). Rollback/P2P netcode (netplayjs-style) requires fully deterministic, rewindable game logic that LLM-generated code will not reliably satisfy; PlayroomKit is the quickest casual option but its "authority" is an elected player host.

### Cited Findings
- Colyseus is MIT, authoritative, with rooms, matchmaking and automatic state sync; SDKs for Web, Unity, Defold, Haxe, Cocos and Construct 3; self-host free, managed cloud from about $15/month — [docs.colyseus.io recipes](https://docs.colyseus.io/recipes); [cinevva multiplayer guide](https://app.cinevva.com/de/guides/multiplayer-browser-game)
- Colyseus 0.17 added full-stack TypeScript safety (client imports the server type for room names, state and messages), automatic reconnection, `onDrop` hooks, `defineServer()`, and a Zod-based `createEndpoint`; schema moved to 4.x; browser client moved to `@colyseus/sdk` — [colyseus 0.17 blog](https://colyseus.io/blog/colyseus-017-is-here/); [migrating to 0.17](https://docs.colyseus.io/migrating/0.17)
- Colyseus 0.18 requires `@colyseus/schema` 5.x ("reconnect resync and input schema reflection build on it") — [migrating to 0.18](https://docs.colyseus.io/migrating/0.18)
- npm: `colyseus` 0.18.10 (2026-10-22), `@colyseus/schema` 5.0.42 (2026-10-20), `@colyseus/sdk` 0.18.8 (2026-10-26), all MIT — [npm colyseus](https://www.npmjs.com/package/colyseus); [npm @colyseus/sdk](https://www.npmjs.com/package/@colyseus/sdk)
- `@colyseus/sdk` 0.18.8 ships a `predict/` module: "Predict - drop-in prediction layer for Colyseus 0.18+ clients" combining field smoothing (lerp / extrapolate / damped) and dead reckoning for entities you do not control; `predict.reconciler(self, ...)` gives "ACTIVE server-reconciled rollback for the entity you DO control: apply input now, rewind to server truth + replay, smoothly correcting"; `predict.sim(...)` does the same over an engine-backed world; `predict.defineEvent(...)` provides optimistic discrete events with confirm/auto-reject/TTL; the server `room.clock` (RTT/server time) is delivered automatically when the room uses `defineInput()` — header doc of `build/predict/Predictor.mjs` in the [npm @colyseus/sdk 0.18.8 tarball](https://www.npmjs.com/package/@colyseus/sdk)
- PlayroomKit: single JS/TS SDK with synchronized global and per-player state, "an elected host model", RPCs, matchmaking and lobbies; Phaser listed as supported; the host "can run the game logic, such as physics calculations ... then update the shared state"; infrastructure hosted by Playroom with a read-only gameId; Unity wrapper is WebGL-only beta; Phaser 3 + Playroom Connect Four tutorial exists — [apievangelist Playroom](https://providers.apievangelist.com/providers/playroom/); [toolmage Playroom](https://www.toolmage.com/pt/tool/playroom/); [phaser.io tutorial](https://phaser.io/news/2025/01/multiplayer-connect-four-game-with-phaser); [playroom-unity](https://github.com/asadm/playroom-unity)
- npm `playroomkit` 0.0.97 (2026-07-06) has no license field (proprietary SDK) and the measured `multiplayer.mjs` is 1,183 KB raw / 353 KB gzip — [npm playroomkit](https://www.npmjs.com/package/playroomkit)
- Hathora: CB Insights and PitchBook list Hathora as acquired (March 4, 2026 per CB Insights); its `@hathora/client-sdk` was last published 2023-07-21 and `@hathora/cloud-sdk-typescript` 2.25.6 on 2025-11-27 — [CB Insights](https://www.cbinsights.com/company/hathora/financials); [PitchBook](https://pitchbook.com/profiles/company/497214-91); [npm client-sdk](https://www.npmjs.com/package/@hathora/client-sdk); [npm cloud-sdk](https://www.npmjs.com/package/@hathora/cloud-sdk-typescript)
- Rivet: open-source, self-hostable stateful "actors" with realtime, fault tolerance and edge deployment, positioned against Cloudflare Durable Objects; Rivet Cloud Free $0 (100k awake actor-hours, $5 compute cap), Hobby from $20/mo (400k hours), Team from $200/mo; metered $0.05 per 1k awake actor-hours, $0.15/GB egress; `rivetkit` 2.3.30 (2026-10-20, Apache-2.0) with 3.0.0-preview.2 on `next` — [rivet.dev cloud](https://rivet.dev/cloud/); [npm rivetkit](https://www.npmjs.com/package/rivetkit)
- PartyKit was acquired by Cloudflare in April 2024 and is built on Durable Objects (one DO per room); `partyserver` 0.5.10 (2026-08-03, ISC) and `partysocket` 1.3.0 (2026-06-23, 6 KB) are current — [CB Insights PartyKit](https://www.cbinsights.com/investor/partykit); [npm partyserver](https://www.npmjs.com/package/partyserver); [npm partysocket](https://www.npmjs.com/package/partysocket)
- Socket.io 4.8.4 (2026-09-25, MIT); client min 46 KB / 14 KB gzip; it provides transport only (no rooms-with-state-sync abstraction beyond basic rooms) — [npm socket.io](https://www.npmjs.com/package/socket.io)
- Nakama JS client `@heroiclabs/nakama-js` 2.8.0 last published 2024-06-21 (Apache-2.0); no 2026 Nakama information surfaced — [npm nakama-js](https://www.npmjs.com/package/@heroiclabs/nakama-js)
- NetplayJS: P2P rollback netcode over WebRTC, "no server hosting or synchronization code required"; `RollbackWrapper` requires a rewindable game, otherwise `LockstepWrapper` (e.g. for complex physics engines); separate signaling server; ISC; last npm publish 0.4.1 on 2023-04-02 and last repo push Oct 2024 — [npm netplayjs](https://www.npmjs.com/package/netplayjs); [netplayjs aggregator](https://awesome.ecosyste.ms/projects/github.com%2Frameshvarun%2Fnetplayjs)
- geckos.io (WebRTC data channels for Node, UDP-like) server 3.1.0 (2026-03-27, BSD-3) — [npm @geckos.io/server](https://www.npmjs.com/package/@geckos.io/server)
- A June-2026 guide: "the standard for a browser multiplayer game in 2026 is WebSockets with an authoritative server, using a framework like Colyseus or PartyKit that handles rooms and state sync" (promotional secondary source) — [cinevva](https://app.cinevva.com/de/guides/multiplayer-browser-game)
- Phaser's comparison: Phaser's headless mode supports server-side multiplayer simulation; KAPLAY and Excalibur lack it — [phaser.io comparison](https://phaser.io/news/2026/04/phaser-vs-kaplay-vs-excalibur-2d-web-game-framework)

### Inferences
- Authoritative server is the realistic default for generated games because it tolerates non-deterministic, buggy or cheating clients: the server owns truth, and the generated client only needs to (a) send inputs and (b) render schema state through Colyseus's prediction helpers. Rollback requires every generated game to be a pure, rewindable, deterministic state machine; that is a strong constraint an LLM will violate silently (e.g. `Math.random`, `Date.now`, floating-point engine physics).
- A fixed "room template" (`GameRoom extends Room<State>` with `defineInput`, a 20 Hz tick, a schema with players/entities) that the agent fills in, plus the matching Phaser client scene, lets the platform guarantee multiplayer works without the model designing netcode. Running the same simulation module on the server via phaser-on-nodejs (or a renderer-free "sim" module shared by client and server) is the practical way to get prediction/reconciliation using `predict.sim(...)`.
- PlayroomKit is a reasonable "level 0" for party/casual games (no backend code at all) but its host-client authority and 353 KB gzip SDK are drawbacks; PartyKit/Durable Objects or Rivet are good hosting substrates if the platform wants edge-hosted rooms, but Colyseus brings the game-specific schema/prediction layer those lack.

### Gaps
- Photon (Fusion/Realtime JS) web support and Nakama's 2026 state were not researched (search budget exhausted); Hathora's acquirer and post-acquisition product status are unknown.
- Colyseus Cloud 2026 pricing beyond "from ~$15/month" (secondary) was not verified from colyseus.io.

## Key Question 5: Sandboxing user/AI-generated code (browser and server)

### Takeaway
Browser: run each generated game in a sandboxed iframe on an opaque origin (`sandbox="allow-scripts"` without `allow-same-origin`), with a `<meta>` CSP placed first that denies network and navigation, and a MessageChannel-based bridge for platform APIs (assets, multiplayer, state readback). Server: V8-isolate sandboxes (isolated-vm, Cloudflare Dynamic Workers) are fast but have a larger attack surface than microVMs; a critical isolated-vm escape was patched in August 2026, so pin versions and treat server-side execution of generated code as optional.

### Cited Findings
- Pattern for agent-generated HTML: sandboxed iframe + `<meta>` CSP + MessageChannel parent API; the CSP meta tag must be first so it applies before guest scripts; pairing `allow-scripts` with `allow-same-origin` lets the frame remove its own sandbox attribute — [agentpatterns.ai](https://www.agentpatterns.ai/security/browser-sandbox-agent-generated-html/)
- Omitting `allow-same-origin` makes the frame an opaque origin with no access to the parent's DOM or storage, but outbound network requests still need CSP to block them; a default-deny CSP plus a bootstrap messaging script is the recommended setup — [docs.curiosity.ai sandbox](https://docs.curiosity.ai/tesserae/components/sandbox)
- An LLM-HTML renderer splits coordinator and renderer iframes with separate CSPs — [generate-html-element PR](https://github.com/PaulKinlan/generate-html-element/pull/3)
- isolated-vm: a critical sandbox escape (type confusion in its C++ binding layer, found by Endor Labs; not in V8 itself) was patched in August 2026; the library is used by AI agent frameworks such as n8n and Mastra; npm latest is 7.0.1 (2026-08-05) — [CSO Online](https://csoonline.com/article/4212151/critical-flaw-patched-in-popular-javascript-sandbox-used-in-ai-projects.html); [npm isolated-vm](https://www.npmjs.com/package/isolated-vm)
- Cloudflare Dynamic Worker Loader: open beta since 24 March 2026 for paid Workers plans; a Worker instantiates a sandboxed Worker from runtime-supplied code; `globalOutbound: null` blocks all outbound network, or intercepts/rewrites it; Cloudflare itself notes isolates have "a more complex attack surface than hardware virtual machines"; reported pricing $0.002 per unique Worker loaded per day after beta — [InfoQ](https://infoq.com/news/2026/04/cloudflare-dynamic-workers-beta); [alchemy.run worker-loader](https://alchemy.run/cloudflare/compute/worker-loader); [cogley.jp](https://cogley.jp/articles/cloudflare-dynamic-workers)
- Cloudflare's container-based Sandbox SDK has 2-3 s cold starts vs millisecond isolates; `@cloudflare/sandbox` is at 1.0.3 (2026-10-22) — [lumenize comparison](https://lumenize.com/blog/cloudflare-code-isolation-guide); [npm @cloudflare/sandbox](https://www.npmjs.com/package/@cloudflare/sandbox)
- PixiJS provides a web-worker build (OffscreenCanvas rendering) — [npm pixi.js](https://www.npmjs.com/package/pixi.js)
- Godot web exports historically required cross-origin isolation headers (COOP/COEP) for SharedArrayBuffer; from 4.3 the "use threads" toggle can be disabled to avoid this — [Godot 4.2 docs](https://docs.godotengine.org/en/4.2/tutorials/export/exporting_for_web.html); [Godot forum](https://forum.godotengine.org/t/godot-export-to-the-web-issues/118678)

### Inferences
- The iframe-on-opaque-origin model is also what makes "remix" cheap: each game is a self-contained HTML+JS bundle served from a per-game subdomain or `srcdoc`, so the platform never executes generated code in its own origin. Multiplayer and asset access are mediated through `postMessage` so the generated code never holds credentials; the Colyseus client can be injected into the frame with a short-lived room token.
- COOP/COEP requirements (needed by threaded Godot/Unity builds and by SharedArrayBuffer) conflict with embedding third-party content and iframes, another reason the JS engines fit a community-hosted platform better.
- Server-side execution of generated code is only needed for authoritative multiplayer. Running generated room logic inside Cloudflare Dynamic Workers (with `globalOutbound: null`) or isolated-vm behind a fixed Colyseus room shell keeps the trust boundary; alternatively the platform can run generated logic in Playwright/headless Chromium per room (slower, but the same sandbox model as the client).

### Gaps
- Deno Sandbox and Deno Deploy isolation for untrusted code were not researched (search budget).
- No source combined Colyseus with isolated-vm/Dynamic Workers; this architecture is an inference, not an observed deployment.

## Key Question 6: Does Godot 4 web export work well enough in 2026 for instant-play community games?

### Takeaway
Godot 4 web export is functional and improving (single-threaded builds since 4.3 remove the SharedArrayBuffer/COOP-COEP requirement; 4.5 added WASM SIMD; 4.7 reportedly adds wasm64), but default builds are ~35-50 MB (30+ MB engine wasm) with only custom export templates reaching ~2.7 MB, iOS/Safari single-thread quirks persist, and the runtime is GDScript/C# rather than TypeScript, so it is not a good fit for instant-play, LLM-generated, iframe-hosted 2D games.

### Cited Findings
- Official 4.2 docs: "Godot 4 web exports always use SharedArrayBuffer", requiring a secure context and specific cross-origin headers; `coi-serviceworker` is the workaround when headers cannot be set — [Godot 4.2 docs](https://docs.godotengine.org/en/4.2/tutorials/export/exporting_for_web.html)
- Community: Godot 4.3 added a "use threads" export toggle; disabling it removes the SharedArrayBuffer requirement; a 4.4.1 user fixed itch.io's cross-origin-isolation error by unticking thread support; another 4.4.1/Firefox user found single-threaded mode "supposed to work without SharedArrayBuffer ... seems to not be working" and threaded builds inconsistent (anecdotal) — [Godot forum](https://forum.godotengine.org/t/godot-export-to-the-web-issues/118678); [itch.io post](https://itch.io/post/14671641)
- Size: default 4.4-era web export ~42 MB; custom-built export template with Brotli ~2.7 MB; "the web build's size seems to be mostly unchanged in 4.5" — [popcar guide](https://popcar.bearblog.dev/how-to-minify-godots-build-size/); tutorial estimate 35-50 MB total with ~30 MB wasm — [viblo.asia](https://viblo.asia/p/xuat-godot-4-sang-web-html5-huong-dan-thuc-te-va-4-loi-hay-gap-7Z4DEGBwJnX)
- Godot 4.7 (reported 19 June 2026) adds wasm64 web builds lifting the 4 GB ceiling; web still uses WebGL 2.0 via the Compatibility renderer (secondary source) — [cinevva](https://app.cinevva.com/pt-BR/news/2026-06-19-godot-4-7-released); a January 2026 preview expected WebGPU groundwork and WASM optimizations building on 4.5's SIMD support (forecast) — [cinevva 4.6 preview](https://app.cinevva.com/fr/news/2026-01-10-godot-4-6-preview)
- A user migrating a large project to 4.6 hit a memory-access-out-of-bounds error on web export — [Godot forum 4.6](https://forum.godotengine.org/t/ok-4-6-is-actually-clean/131737)
- AI-on-Godot tooling (Summer Engine, Orca Engine) targets the desktop editor, with exports and commercial rights gated by paid plans — [summerengine.com](https://www.summerengine.com/blog/best-ai-game-engines-2026); [Summer vs Orca](https://www.summerengine.com/blog/summer-vs-orca-engine.md)

### Inferences
- Even at 2.7 MB (custom template + Brotli), a Godot game is ~8x Phaser's full bundle and requires maintaining custom engine builds per Godot version; at the default ~42 MB it is incompatible with "instant" play on mobile data.
- Godot would also force a second toolchain (export templates, headless editor) into the generation loop and per-game 30 MB artifacts into the community CDN, whereas JS games are a few KB of code sharing one cached engine file.

### Gaps
- Official Godot 4.5/4.6/4.7 release notes and the current "exporting for web" docs were unreachable; the wasm64 and SIMD claims rest on secondary coverage.
- No measurement of Godot web load time on mid-range Android in 2026 was found.

## Key Question 7: Recommendation

### Takeaway
Standardise on Phaser 4.x (pinned minor, TypeScript, Arcade physics default, Matter optional) wrapped in a thin platform SDK that enforces a fixed-timestep loop, seeded RNG, state/step hooks for Playwright, and a Colyseus 0.18 authoritative room template with the SDK's prediction layer; host every game in a sandboxed opaque-origin iframe with a deny-by-default CSP, and keep PixiJS 8 as the fallback renderer only if a bespoke engine becomes necessary later.

### Cited Findings
- Phaser 4: 345 KB gzip full build, Arcade + Matter physics, tilemaps, particles, filters/lighting, bundled types, HEADLESS mode, in-package agent skills, MIT, commercial maintainer — [unpkg phaser@4.2.1 README](https://unpkg.com/phaser@4.2.1/README.md); [npm phaser](https://www.npmjs.com/package/phaser)
- Phaser is the engine behind all 2D games on Rosebud, the closest existing precedent — [phaser.io news](https://phaser.io/news/2024/01/create-phaser-games-from-prompts-with-rosebud-ai)
- Colyseus 0.18 + `@colyseus/sdk` 0.18.8 provide typed schema sync and a built-in prediction/reconciliation layer (MIT) — [npm @colyseus/sdk](https://www.npmjs.com/package/@colyseus/sdk); [colyseus 0.17 blog](https://colyseus.io/blog/colyseus-017-is-here/)
- Sandboxed-iframe + first-position meta CSP + MessageChannel is the documented pattern for agent-generated HTML — [agentpatterns.ai](https://www.agentpatterns.ai/security/browser-sandbox-agent-generated-html/)
- Deterministic testing protocol (`advanceTime`, `render_game_to_text`, Playwright clock) — [openai develop-web-game skill](https://skills.cat/skills/trailofbits/skills-curated/openai-develop-web-game)

### Inferences
- Ranking for this use case (browser-first, 2D, LLM-authored, instant/remixable, multiplayer): 1) Phaser 4; 2) PixiJS 8 + in-house ECS (only if you are willing to own a framework and its agent skills); 3) KAPLAY (once 4000 stabilises; tiny and simple, but no headless mode and alpha churn); 4) Excalibur (TypeScript-native, still 0.x); 5) Defold (1 MB builds, Colyseus SDK, but Lua and desktop editor); 6) Godot 4 web; 7) Unity Web; 8) Construct 3 / GameMaker (proprietary editors, weak code-first story); 9) Bevy and LÖVE/love.js (toolchain and size mismatched to instant web play).
- The decisive factors were not raw renderer speed (all JS options are adequate for 2D platformers) but: bundle size, API stability relative to LLM training data, first-party agent documentation, headless testability, and whether the engine can live inside a sandboxed iframe without COOP/COEP.

### Gaps
- Everything above about agent accuracy per engine is qualitative; the platform should run its own eval (same prompt set, Phaser vs KAPLAY vs Pixi+ECS, measured by Playwright pass rate) before locking in.
