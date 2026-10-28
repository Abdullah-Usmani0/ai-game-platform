# AI Game Platform

Research and planning for a community-driven platform where users describe a 2D or platformer game, optionally referencing existing games for style, and an AI harness builds a playable, remixable browser game that other people can play and test.

## Contents

- `docs/system-plan.md` — the full system plan: product shape, model-agnostic quality strategy, architecture, monorepo layout, genre template contract, harness directory, generation state machine, data model, bundle contract, phased build plan and tracked risks.
- `docs/2D AI game creation harness.md` — the main research report: reference games and what makes them high quality, the style-reference feature design, the recommended harness architecture (engine, skills, templates, asset pipeline, verification, multiplayer, sandboxing, cost), and a phased build plan.
- `docs/research_notes/` — the underlying research notes the report was synthesized from:
  - `reference_games_and_quality.md` — the 2D reference canon, art taxonomy, and game-feel constants
  - `engines_and_multiplayer.md` — browser engine comparison, multiplayer patterns, sandboxing, agent testing
  - `harness_architecture.md` — how existing AI game tools work, relevant research, coding-agent harness patterns, cost
  - `asset_pipeline.md` — sprite, animation, tileset, audio and font generation tools and the de-AI cleanup pass
  - `reference_feature_legal_quality.md` — legal boundaries for "in the style of", storefront policies, ownership, automated quality metrics
  - `model_agnostic_quality.md` — evidence on producing frontier-quality output on cheap or open-weight models: verifier-driven sampling, structured outputs, curated knowledge, prompt optimization, distillation, multi-agent patterns, open models and harnesses

## Repository layout

- `packages/schemas` — zod schemas for every artifact: style card, systems, GDD front matter, levels, behaviour FSM and ECA rules, waves, playtest and gate reports, bundle manifest, bridge messages, model policy, trajectory, create/edit requests and the edit route.
- `packages/sdk` — the runtime: a deterministic pure-TypeScript simulation (seeded RNG, event bus, tilemap physics, FSM/ECA interpreters, `defineSystem`) plus a Phaser 4 view, manual/realtime drivers, the test seam (`window.__game`, `window.__TEST__`) and the iframe bridge guest.
- `packages/engine` — builds the shared engine chunk (Phaser + SDK) that every game bundle treats as externals; syncs Phaser's agent skills into the harness.
- `packages/validators` — pure checks: level solver (BFS over the feel preset's jump envelope), behaviour structure, GDD front matter and sections, systems against the catalog, juice lint over a playtest event log, parameter impact.
- `packages/template-core` and `packages/templates` — the genre contract (`GenreManifest`), shared systems (pickups, top-down movement) and the genre packages: `genres/platformer` (Celeste-class feel, chunk-grammar levels, walker/hopper/turret FSMs, walker and chaos bots), `genres/survivors` (top-down arena, auto-attack with level-ups, wave spawner, kiter/afk/chaos bots, DPS-vs-pressure wave validation) and `genres/topdown-action` (rooms joined by doors, directional melee with aim assist, telegraphed enemy bites, archers, the exit locked until the floor is clear, a path-finding clearer bot as solver). Adding a genre is one entry in `packages/templates/src/node.ts`.
- `packages/game-base` — the dependency set every scaffolded game links against, so a game outside the workspace still builds and tests.
- `tools/scaffold` — `gg-scaffold`: emits a complete game package from a GDD, systems.json and style card; every placeholder level passes the validator and the genre's solver bot.
- `packages/bots` — Playwright smoke (ready flag, zero console errors, manual vs realtime vs in-page replay hash), contact sheets, a static server.
- `packages/llm` — provider clients (Anthropic, OpenAI-compatible), pricing, and the sample → verify → repair → select loop for schema-constrained artifacts.
- `packages/db` — the `Store` interface (games, versions, jobs, events, trajectories, policies, objects, remix forks with lineage) with a Supabase implementation and a JSON file store for local runs; `supabase/migrations/0001_core.sql` is the schema.
- `packages/catalog` — the style reference feature's boundary: curated cards of unprotectable attributes for named games (palette mood, pixel density, outline rule, animation feel, camera, typography class, audio mood), a resolver for free-text titles, a merge into the style card, and a sanitiser so titles and blocked terms (characters, places, studios) never reach a prompt or a bundle.
- `packages/config` — eslint preset with the GlueTS rules for simulation code, tsconfig presets, the game vite config.
- `samples/platformer` ("First Steps"), `samples/survivors` ("Last Light") and `samples/topdown-action` ("Ember Halls") — hand-tuned golden games built from the template systems plus data.
- `harness/` — the per-job Claude Code project: `AGENTS.md`, path-scoped rules, subagents, hooks, the worker-runnable gate, per-stage presets (`stages.json`), budgets, and skills with bundled scripts (gdd-author, systems-select, mechanic-author, behaviour-author, level-design, asset-prompting, playtest, juice-pass, regression, budget-check, edit-apply, playbook, verify).
- `workers/generator` — the job state machine: create plan (GDD → systems → scaffold → behaviour → implement → levels → integrate → playtest → juice → review → budget → publish) and edit routes (parameter, style, behaviour, content, code); runners for Claude Agent SDK sessions, structured calls and worker-implemented stages; worker-owned gates, checkpoints, trajectories, the publisher; a fake provider for dry runs without keys.
- `apps/web` — Next.js app: create form (with style references), games list, the creator workspace (job progress, playable preview in a sandboxed iframe over the bridge, evidence panel, edit chat, parameter tuning panel and style card editor that send deterministic edits, remix), the play page with a remix button.
- `tools/evals` — the benchmark: 20 prompts, dry or live runs per policy, pass^k and per-stage rates, cost per passing game; policy files for the frontier and the first cheap experiment.
- `tools/demo` — `pnpm demo` runs the sample through the whole gate, then a dry-run create job through publish, and prints the evidence bundle.

## Running it

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm demo                       # engine + sample gate + a dry-run create job through publish
pnpm bench --limit 2 --k 1      # one prompt per genre through the pipeline (dry)

# create a game from the CLI (dry run needs no key; drop --dry-run with ANTHROPIC_API_KEY set)
pnpm --filter @gg/worker-generator exec node --import tsx src/cli.ts create --prompt "..." --genre platformer --dry-run
pnpm --filter @gg/worker-generator start -- --once

# the web app (reads the same local store; run a worker alongside it)
pnpm --filter @gg/web dev      # http://localhost:3000/create
```

## Key decisions so far

- Web app first; a desktop wrapper (Tauri) only later for a Steam listing.
- 2D and platformer games only for the first version, with a platformer and a survivors-like as the initial vertical slice.
- Phaser 4 in a thin platform SDK as the fixed runtime; Colyseus for multiplayer; games sandboxed in opaque-origin iframes.
- Named game references resolve to a visible style card of unprotectable attributes; characters, names, logos, layouts and music are blocked.
- Quality must not depend on the model: the model emits data under small schemas and restricted glue code, never engine API calls; every stage samples, verifies, selects and escalates; knowledge is curated from verified runs; a second runner (OpenCode) carries open-weight models.
