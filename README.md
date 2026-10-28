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

## Repository layout (Phase 0)

- `packages/schemas` — zod schemas for every artifact: style card, systems, GDD front matter, levels, behaviour FSM and ECA rules, waves, playtest and gate reports, bundle manifest, bridge messages, model policy, trajectory.
- `packages/sdk` — the runtime: a deterministic pure-TypeScript simulation (seeded RNG, event bus, tilemap physics, FSM/ECA interpreters, `defineSystem`) plus a Phaser 4 view, manual/realtime drivers, the test seam (`window.__game`, `window.__TEST__`) and the iframe bridge guest.
- `packages/engine` — builds the shared engine chunk (Phaser + SDK) that every game bundle treats as externals; syncs Phaser's agent skills into the harness.
- `packages/bots` — Playwright smoke (ready flag, zero console errors, manual vs realtime vs in-page replay hash), contact sheets, a static server.
- `packages/llm` — provider clients (Anthropic, OpenAI-compatible), pricing, and the sample → verify → repair → select loop for schema-constrained artifacts.
- `packages/db` — the `Store` interface with a Supabase implementation and a JSON file store for local runs; `supabase/migrations/0001_core.sql` is the schema.
- `packages/config` — eslint preset with the GlueTS rules for simulation code, tsconfig presets, the game vite config.
- `samples/platformer` — a Celeste-feel platformer written as GlueTS systems plus data (level, enemy FSM, ECA rule); the golden sample and the demo's game.
- `harness/` — the per-job Claude Code project: `AGENTS.md`, path-scoped rules, subagents, hooks, skills, the worker-runnable gate, budgets.
- `workers/generator` — the job state machine: materialise the harness, run a stage (gate-only, structured, or Claude Agent SDK), run the gate, checkpoint, log trajectories, accept versions.
- `apps/web` — Next.js play page hosting bundles in a sandboxed iframe with the MessageChannel bridge host.
- `tools/demo` — `pnpm demo` runs the sample through the whole gate and the worker loop and prints the evidence bundle.

## Running it

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm demo                       # builds engine + sample, runs the gate and a worker job, prints evidence
pnpm --filter @gg/web build && pnpm --filter @gg/web check:bridge   # play page + bridge handshake
```

## Key decisions so far

- Web app first; a desktop wrapper (Tauri) only later for a Steam listing.
- 2D and platformer games only for the first version, with a platformer and a survivors-like as the initial vertical slice.
- Phaser 4 in a thin platform SDK as the fixed runtime; Colyseus for multiplayer; games sandboxed in opaque-origin iframes.
- Named game references resolve to a visible style card of unprotectable attributes; characters, names, logos, layouts and music are blocked.
- Quality must not depend on the model: the model emits data under small schemas and restricted glue code, never engine API calls; every stage samples, verifies, selects and escalates; knowledge is curated from verified runs; a second runner (OpenCode) carries open-weight models.
