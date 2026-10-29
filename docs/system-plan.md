# System plan: community AI 2D game creation platform

## Context

Research (report in `Abdullah-Usmani0/ai-game-platform`, `docs/2D AI game creation harness.md`) established that current prompt-to-game tools (Rosebud, Astrocade, Google Playground) produce prototype-grade output because they let the model improvise runtime, systems, art rules and feel per game, and verify nothing. The reference games (Celeste, Hades, Stardew, Dead Cells, Hollow Knight) reach quality through constraints: one resolution, one palette, exact feel constants, relentless polish. The platform's edge is a harness that turns those constraints into defaults, templates and machine-checked gates, with LLMs confined to design, selection, authoring and advisory critique.

A second research pass (model-agnostic quality, four researchers, Oct 2026) added the requirement that the system produce the same quality bar on cheap or open-weight models. The evidence says this is achievable only when (a) the model's output is small and structured, (b) a deterministic verifier selects among samples and triggers escalation, (c) knowledge is curated by a frontier model and filtered by verifiers, and (d) the model is above a competence floor (roughly 7B+ coder-class). Nothing supports "regardless of model" below that floor. The plan below is built around those four conditions.

Decisions made with the user:
- Web app first (Tauri wrapper later for Steam). 2D and platformer games only.
- AI-first creation with light manual editing (style card, parameter panels, level editor). Full manual editor later.
- Genre template library must grow to all 2D genres; first two shipped are precision platformer and survivors arena, the rest in waves.
- Stack: Next.js + Supabase (auth, Postgres, storage, realtime) + Node workers. Phaser 4 + TypeScript runtime. Colyseus for multiplayer later.
- Team: one developer plus Claude Code. Phases sized for that.
- Quality must not depend on the model: the harness carries quality; model choice changes cost and iteration count only.

Non-goals for v1: 3D, native mobile apps, Steam export, multiplayer, monetization payouts.

Code lives in the `ai-game-platform` repo (monorepo at root, research stays in `docs/`). The Portfolio repo is unrelated and untouched. Package scope `@gg/*` is a placeholder until the product has a name.

## Product shape

Three surfaces, one bundle format:

1. **Create**: chat interview → visible plan (concept, GDD summary, editable style card) → generation with live progress and cost ticker → playable preview with evidence (bot report, screenshot sheet, budget table) → edit loop (chat, style card editor, parameter panels, level editor) → publish.
2. **Play**: feed ranked by per-user engagement (featured traffic excluded), game page with sandboxed iframe, remix button, one-tag rating (fun / confusing / broken / ugly), rewarded test queue for unreleased games.
3. **Profile / lineage**: creator pages, remix tree, credits.

Customization model:
- **Style card** (`style.json`): canvas resolution and scale, pixel/painted flag, named palette roles, outline rule, animation fps per category, camera params, typography, UI tokens, audio mood, post-fx, references, negative list. Form-editable; changes regenerate only assets whose prompt hash changed, then re-run gates, no code edit.
- **Systems config** (`systems.json`): which catalog systems are on and their typed parameters. Exposed as parameter panels with ranges and `affects` metadata; live-tunable in preview via the bridge.
- **Behaviour and content as data**: enemy/interactable FSMs, event-condition-action rules, wave tables, upgrade pools, dialogue trees, levels. Level editor and data tables; every save runs the validator.
- **Code**: bespoke mechanics via chat in a restricted TypeScript subset; full gate loop. Code view for advanced users in phase 3.
- **Checkpoints**: every accepted build is a version; rewind or branch (self-remix).

## Model-agnostic quality strategy

### What the evidence supports (numbers are from the research pass; vendor claims marked)

- **Verifier-driven sampling is the strongest lever and helps weak models most.** Best-of-N selected by executable tests lifts Llama3-8B by 18.4 points vs 3.4 for GPT-4o-mini (CodeRM). Sampling + debug rounds + execution-based selection lets a 3B coder beat GPT-4o-mini and a 14B beat o1-preview (S*). Coverage on SWE-bench Lite goes 15.9% → 56% with 250 samples, but only with an oracle verifier; majority vote and reward models plateau. Floor: Pythia-class models stay at 0% at 10,000 samples.
- **Structure shrinks the gap.** Grammar-constrained decoding of a game DSL gave +36 compilability for a 3B→8B pair and little for 8B→GPT-4o (Ludii GDG). Constrained decoding takes 0.6–4B models from 79–93% to 100% schema validity; the remaining gap is semantic. Oversized schemas (full scene IR) caused 96–99% timeouts on 7B models, so schemas must be small, flat and non-recursive.
- **Engine-API knowledge is the failure mode.** Across 10,400 single-pass attempts by 7B–30B models, zero generated Unity C# scenes compiled; conditioning on a JSON IR instead gave mechanism fidelity F1 up to 1.0. Type-constrained decoding for TypeScript cuts compile errors by more than half across 2B–34B models; `tsc` reject-and-resample against a typed library captures most of that.
- **Curated knowledge helps weak models; self-authored knowledge hurts.** Curated skill files lift pass rate +16.2 pp on average (SkillsBench); skills synthesized by strong agents improve weaker agents by up to 54% (SkillWeaver); skills a weak model writes for itself: −1.3 pp unless verifier-filtered.
- **Prompt/program optimization lifts small models by single to low double digits.** DSPy took llama2-13b from 9% to 47% on a compiled program; GEPA beats RL fine-tuning with 35× fewer rollouts on Qwen3-8B; an optimized gpt-oss-120b matched an unoptimized Opus 4.1 at ~90× lower cost (vendor), though the optimized frontier model still led by 6–7 points.
- **Distillation closes the rest on narrow tasks.** LoRA-tuned 7B models beat GPT-4 by 10 points on average across 31 narrow tasks at under $8 per model (vendor-run study); 5,016 verifier-filtered trajectories took a 32B coder to +32% on SWE-bench Verified. Needs a frontier teacher and verifier-filtered data.
- **Verifier-gated cascades work; learned routers mostly don't.** Cascades that escalate only when the cheap tier fails its tests cut cost 26% on average and up to 70% at equal accuracy; predictive routers rarely beat trivial baselines (RouterBench, LLMRouterBench 2026).
- **Multi-agent: single writer, parallel readers.** Controlled study of 180 configurations: multi-agent degrades sequential tasks by 39–70%, helps parallelizable ones under centralized coordination; independent agents amplify errors 17×. Debate and mixed-model MoA mostly waste tokens. Self-correction without an external signal degrades; a stronger or different-family critic is worth more than more generator iterations.
- **Context length hurts every model and small ones more.** All 18 models in the context-rot study degrade with length; 11 of 13 fall below half their short-context score at 32K once literal matches are removed. Fresh minimal context per step, failed attempts scrubbed from retry context, stable cached prefixes.
- **Harness ≠ model.** The Claude Agent SDK officially supports Claude models only. Harness choice moves scores 3–16 points; same-harness gap between frontier-closed and the best open models is 10–25 points on terminal-style agentic boards and under 4 points on SWE-bench Verified (Qwen3.6-27B 77.2 vs Opus 4.5 80.9, vendor). Hosting fidelity matters as much as the model: stock vLLM parsed under 20% of Kimi K2 tool calls until chat-template fixes.

### Design rules this plan follows

1. **Three output tiers, no engine API.** The model produces (a) data under small flat schemas, (b) glue in a restricted TypeScript subset against the SDK's typed `System` interface, and never (c) Phaser API calls, rendering, UI, feel or juice code. Tier (c) is fixed template code.
2. **Verify → select → escalate at every stage.** Sample k candidates from the cheap tier, run the deterministic verifier for that stage, select by execution results (model-written tests only as a ranking signal), repair 2–3 rounds with the error digest and the failed attempt scrubbed, then escalate to the frontier tier only when the whole batch fails.
3. **Structured outputs for every data artifact.** Anthropic `output_config` / strict tools on Claude; llguidance or XGrammar on self-hosted open models; provider-side JSON schema on hosted open models. Schemas: non-recursive, bounded enums, fixed-size arrays, split per artifact, a free-text `design_notes` field before numeric fields.
4. **Knowledge is authored by the frontier model and humans, filtered by verifiers.** Skills, exemplars and the ACE-style playbook are written from passing trajectories, never by the cheap model directly. Every playbook entry links to a verified trajectory.
5. **Harness portability from day one.** Canonical `AGENTS.md` with `CLAUDE.md` symlinked, skills in `.agents/skills` with `.claude/skills` symlinked, and gates owned by the worker, not by harness hooks. Hooks are an optimization on the Claude runner, not a dependency.
6. **Per-model prompt optimization.** GEPA/MIPROv2 runs over skill prompts for each model in the policy, using feedback-rich metrics built from gate reports (compile, validate, playtest failures as text). Budget 100–500 evaluations per run.
7. **Distillation flywheel.** Every verifier-passing (input → artifact) pair is stored; once 2–5k exist for a stage, LoRA a 7B–30B model on it, benchmark it, promote it into the policy for that stage.
8. **Cross-family critic, calibrated judges.** The reviewer and art-director use a different model family from the generator. Small-model judges only run validated rubric checks, never gate alone.
9. **Evals are the flywheel.** Benchmark prompts graded by gates, tracked as pass^k (3-in-a-row), every failure labelled by failure mode and converted into a regression case, a validator, or a playbook delta.
10. **Single writer, parallel readers, code-owned loop.** One session edits at a time; reviewer, playtester and art-director are read-only and run in parallel; the worker state machine owns control flow.

### Model policy (versioned per stage; `model_policies` table)

| Role | Frontier path | Cheap path (hosted) | Self-host option | Effective cost/M tokens (agentic mix, ~70% cache reads) |
|---|---|---|---|---|
| Design: GDD, systems selection | Opus 5.5 | DeepSeek V4 Flash, MiniMax M2.5, GLM-5.x | — | Opus ≈ $2.9; DeepSeek V4 Flash ≈ $0.10 |
| Implementation: glue systems | Sonnet 5.5 | Qwen3.6-27B, DeepSeek V4 Flash, MiniMax M2.5 with k-sampling | Qwen3.6-27B on 1–2 GPUs | Sonnet ≈ $1.5; MiniMax ≈ $0.26 |
| Routing, triage, log reading | Haiku 5.5 | Qwen3.6-35B-A3B, gpt-oss-120b | Qwen3-Coder-30B-A3B | Haiku ≈ $0.08; gpt-oss ≈ $0.05 |
| Critic, reviewer | Sonnet 5.5 (different family from generator) | cross-family open model | — | as above |
| Vision critic (advisory) | Sonnet 5.5 vision | Qwen-VL / MiMo (advisory only) | — | — |
| Data tier (levels, waves, FSMs, rules) | Haiku/Sonnet strict schema | distilled 7–30B LoRA + llguidance (phase 3) | yes | ≈ $0.05–0.10 |

Cost per game at 5–10M tokens: frontier path $7–15 (Sonnet-heavy, cached), Opus-everywhere $15–29, cheap path $0.5–3. Self-hosting only beats hosted open-model APIs for the ≤35B-active-3B class at high utilization; frontier-open models (GLM-5.x, Kimi K3, DeepSeek V4 Pro) on US hosts cost about what cached Sonnet costs and are not the cheap tier. Free tiers (50–1,500 requests/day) are for development only.

### Harness runtime (two runners, one harness)

- **Claude runner**: Claude Agent SDK, `settingSources: ['project']`, native hooks, structured outputs via `output_format`, per-stage `model`/`effort`/`maxTurns`/`max_budget_usd`.
- **Open runner**: OpenCode headless (`opencode serve` + SDK) because it reads `CLAUDE.md` and `.claude/skills` directly, covers 75+ providers and local vLLM/Ollama, and blocks tools via `tool.execute.before` plugins. Qwen Code is the alternative if Claude-shaped `Stop`/`SubagentStop` hook parity matters more than provider breadth. Structured data stages bypass the agent harness entirely and call the model API with a schema.
- **Worker owns the gates**: after every session the worker runs `pnpm gate` itself regardless of runner; hooks only shorten the loop on the Claude runner.
- **Provider discipline**: pin providers (OpenRouter allowlists / exacto endpoints), run the vendor tool-call verifiers (MiniMax, Moonshot) in CI, use model-specific parsers on vLLM, echo `reasoning_content` back for models that need it, and keep the Claude SDK off proxies (Anthropic says non-Claude routing is unsupported and it strips structured outputs).

## Architecture (layers)

| Layer | Decision |
|---|---|
| Runtime | Phaser 4.2.x pinned, TypeScript, Arcade physics, wrapped in `@gg/sdk` (fixed scene template, fixed-timestep injectable clock, seeded PRNG, typed event bus, code-drawn UI kit, feedback binder, FSM/ECA interpreters, test seam, bridge guest) |
| Hosting | each game a self-contained bundle in a sandboxed opaque-origin iframe with first-position meta CSP; one shared immutable engine chunk on the CDN; MessageChannel bridge |
| Design layer | `concept.md`, `gdd.md` (3 pillars, scope budget, feedback-events table), `systems.json`, `style.json`, behaviour and content data |
| Templates | genre packages satisfying one `GenreManifest` (systems, feel presets, level grammar + generator + solver, validator, bots, GDD fragment, panels, golden samples, exemplars) |
| Harness | portable Claude Code-style project: `AGENTS.md` (`CLAUDE.md` symlink) < 200 lines, path-scoped rules, skills with bundled scripts, four read-only or scoped subagents, hooks on the Claude runner, worker-owned gates |
| Model layer | versioned per-stage policy (runner, model, k, escalation); verify-select-escalate loop; structured outputs; prompt optimization; distillation flywheel |
| Verification | rules → visual → judge: tsc/eslint/vitest, solver, headless seeded smoke, bots, juice linter, asset QA, budgets, masked screenshot regression, cross-family reviewer, advisory VLM |
| Assets | style contract first; grid-native generators (PixelLab, Retro Diffusion) for pixel families, reference-conditioned general models one pose per call for painted; deterministic de-AI pass; code-drawn UI/VFX; OFL/CC0 fonts; ChipTone/ElevenLabs SFX; Stable Audio or Lyria music; per-asset provenance |
| Learning | trajectory logging, failure-mode labels, eval set with pass^k, playbook deltas, training pairs, per-model optimized prompts |

## Monorepo layout (pnpm workspaces + turborepo)

```
ai-game-platform/
├── docs/                      # existing research (unchanged)
├── pnpm-workspace.yaml  turbo.json  package.json  tsconfig.base.json
├── .github/workflows/ci.yml   # typecheck, unit, template samples gate, harness smoke, provider verifiers
├── supabase/                  # config.toml, migrations/*.sql, seed/{reference_catalog.csv, tags.csv}
├── apps/web/                  # Next.js App Router
├── packages/
│   ├── schemas/               # @gg/schemas  zod + JSON Schema + TS types for every artifact, message, behaviour format
│   ├── sdk/                   # @gg/sdk      platform SDK over Phaser 4 incl. FSM/ECA interpreters and GlueTS System API
│   ├── engine/                # @gg/engine   pins phaser, builds shared engine chunk, syncs Phaser-shipped skills
│   ├── templates/             # @gg/templates registry + core systems + genres/<g> packages + exemplars
│   ├── validators/            # @gg/validators pure deterministic checks (level, juice, budget, style, gdd, systems, behaviour, impact)
│   ├── bots/                  # @gg/bots     Playwright host + in-page bot runtime, contact sheets, masked diff
│   ├── asset-pipeline/        # @gg/assets   provider adapters, prompt composer, de-AI pass, QA, IP screen, provenance
│   ├── llm/                   # @gg/llm      provider clients (Anthropic, OpenAI-compatible, vLLM), structured-output helpers, price table, policy loader
│   ├── db/                    # @gg/db       Supabase types, typed queries, RPC wrappers
│   ├── ui/                    # @gg/ui       style-card editor, panel renderer, level editor, evidence viewer, job stream
│   └── config/                # @gg/config   eslint preset (+ eslint-plugin-gg GlueTS rules), prettier, tsconfig, vite.game.config
├── harness/                   # portable Claude Code-style project template, copied per job
├── workers/
│   ├── generator/             # stage state machine, runners (claude-sdk, open), sampling + cascade, gates, checkpoints
│   ├── assets/                # provider calls, de-AI + QA + IP screen (only holder of provider keys)
│   ├── publisher/             # bundle, manifest, thumbnail, goldens, upload, accepted version
│   └── multiplayer/           # phase 4: Colyseus shell
└── tools/
    ├── scaffold/              # `gg scaffold --systems systems.json --genre platformer --out game/`
    ├── catalog/               # reference catalog authoring, blocked-term tests, seeder
    ├── evals/                 # bench prompts, same-harness runner across policies, pass^k, cost per passing game
    ├── optimize/              # GEPA / MIPROv2 runs over skill prompts per model, feedback-rich metrics from gate reports
    └── distill/               # export verified pairs, launch LoRA jobs (Fireworks/Together), evaluate, promote
```

Key package rules:
- `eslint-plugin-gg` (GlueTS): bans `Math.random`, `Date`, `setTimeout`/`setInterval`, `async`/`await`, DOM access, direct `phaser` imports, closures capturing mutable outer state, `this`/classes in systems; requires asset keys to exist in the manifest and config access through the typed `config` object.
- `vite.game.config.ts` externalises `phaser` → `window.Phaser` and `@gg/sdk` → `window.GG`, no eval, no dynamic remote import.
- Provider keys exist only in `workers/assets` and `packages/llm` inside the generator worker; generator egress is model providers + Supabase only, unprivileged user per container (generated vitest runs there).

## Genre template library (additive by construction)

```
packages/templates/
├── src/registry.ts              # the ONLY shared edit per new genre
├── src/manifest.schema.ts       # zod GenreManifest; CI enumerates genres/* and asserts completeness
├── src/catalog.ts               # builds catalog.json from every system's config.ts metadata
├── src/core/systems/<id>/{index.ts, config.ts, index.test.ts, README.md}
│     # scene-flow, hud, pause-menu, settings, save-load, audio-bus, input-map, camera,
│     # feedback-binder, progression, dialogue-lite, tutorial-segment, accessibility,
│     # fsm-runner, eca-runner (behaviour-as-data interpreters)
└── genres/<genre>/              # workspace package @gg/template-<genre>
    ├── manifest.ts
    ├── systems/<id>/{index.ts, config.ts, index.test.ts, README.md}
    ├── feel/*.json              # presets as data
    ├── level/{grammar.ts, generator.ts, solver.ts}
    ├── behaviour/{fsm.schema.ts, eca.schema.ts, actions.ts}   # fixed action/condition vocabulary for this genre
    ├── validator.ts
    ├── bots/{*.bot.ts, feel.spec.ts}
    ├── gdd/{fragment.md, interview.md}
    ├── exemplars/               # 10–30 verified (prompt → systems.json / level / FSM / glue) pairs, retrieved by similarity
    ├── scaffold/                # files copied into game/
    ├── panels.ts                # user-tweakable keys: label, min, max, step, affects: ['levels'|'assets'|'none']
    └── samples/                 # 2–3 hand-tuned golden games: eval baselines + feel-parity references
```

```ts
interface GenreManifest {
  id; name;
  requiredSystems: SystemId[]; optionalSystems: SystemId[];
  feelPresets: Record<string, FeelPreset>; defaultFeel: string;
  levelGrammar: { kind: 'tilemap'|'arena'|'rooms'|'graph'; schema; fileGlob; generate; solve? };
  behaviour: { fsmSchema; ecaSchema; actions: ActionVocabulary; conditions: ConditionVocabulary };
  validate(level, systems, behaviour): ValidationReport;
  bots: BotSpec[]; feelSpec: string;
  gddFragment: string; interviewFragment: string; exemplarsDir: string;
  scopeBudget: Record<'small'|'medium'|'large', ScopeBudget>;
  panels: PanelSpec[]; samples: string[];
}
```

| Template | Wave | Grammar | Feel preset | Validator | Bots |
|---|---|---|---|---|---|
| Precision platformer | 1 | tilemap | Celeste constants (60 Hz; coyote 0.1 s; buffer 0.1 s; var-jump 0.2 s; apex half-gravity; air control 0.65; corner-correct 4 px; dash 0.15 s + 0.05 s freeze; squash 0.6×1.4 / 1.6×0.4) | BFS/A* over (tile, vx-bucket) with jump arc from preset; reachability, win path, spawn safety, collectible counts, ramp monotonic, "can't-fail first 30 s" | walker, chaos, feel.spec |
| Survivors arena | 1 | arena | melee (hitstop 3–5 / 8–12 f; trauma² shake max 0.6, decay 300 ms; flash 60 ms; knockback; pickup magnet) | DPS-vs-spawn-pressure model, upgrade graph consistency, arena reachability | kiter, afk (must die within N s), chaos, feel.spec |
| Top-down action (Hades-like) | 2 | rooms | melee + dash | room graph connectivity | room-clear bot |
| Metroidvania | 2 | tilemap | platformer | ability-gated BFS | progression bot |
| Shmup | 2 | arena | bullet grammar | pattern density / dodgeability sim | dodge bot |
| Puzzle (Sokoban-class) | 3 | tilemap | n/a | tree-search solver with step budget | solver |
| Deckbuilder | 3 | graph | n/a | card-economy sim (win-rate bands) | heuristic player |
| Life-sim / farming | 3 | rooms | top-down | schedule/economy sim | routine bot |
| Action roguelike | 4 | rooms | melee | run-graph + economy sim | run bot |

Build survivors second but before any platformer-specific shortcut lands in `core/`, so the manifest is proven against two dissimilar grammars.

## Harness directory (per-job, portable across runners)

Materialised per job to `/work/<job_id>/`; `game/` is scaffolded, not in the template.

```
harness/
├── AGENTS.md                       # canonical, < 200 lines; CLAUDE.md -> AGENTS.md symlink
├── .agents/skills/                 # canonical skills; .claude/skills -> ../.agents/skills symlink
│   ├── gdd-author/      SKILL.md, templates/gdd.template.md, fragments/<genre>.md, scripts/{check-gdd,scope-budget}.ts
│   ├── systems-select/  SKILL.md, catalog.json, schema/systems.schema.json, scripts/{scaffold,diff-systems}.ts
│   ├── mechanic-author/ SKILL.md (GlueTS rules + typed System API primer), examples/*.ts, scripts/{new-system,event-table,sample-select}.ts
│   ├── behaviour-author/ SKILL.md, schemas/{fsm,eca}.json, vocab.md, scripts/{validate-behaviour,render-fsm}.ts
│   ├── level-design/    SKILL.md (context: fork, agent: level-designer), ramp-spec.md, scripts/{generate-level,validate-level,render-level,difficulty-report}.ts
│   ├── asset-prompting/ SKILL.md, negative.md, scripts/{compose-prompts,placeholder-atlas,asset-status,asset-qa}.ts
│   ├── playtest/        SKILL.md (allowed-tools restricted), report.schema.json, scripts/{smoke,run-bots,contact-sheet,triage}.ts
│   ├── juice-pass/      SKILL.md, checklist.md, clamps.json, scripts/{juice-lint,feel-tests}.ts
│   ├── regression/      SKILL.md, scripts/{golden,diff,metrics-compare}.ts
│   ├── budget-check/    SKILL.md, budgets.json, scripts/budget.ts
│   ├── edit-apply/      SKILL.md, scripts/{apply-params,impact}.ts
│   ├── verify/          SKILL.md (recorded launch recipe; "inspect screenshots beyond the title screen")
│   ├── publish/         SKILL.md (disable-model-invocation: true), scripts/{build-bundle,manifest,write-provenance,checkpoint}.ts
│   ├── playbook/        SKILL.md + entries/<genre>.md   # ACE-style deltas from verified trajectories, read-only for the agent
│   ├── phaser-*/        verbatim Phaser-shipped skills (reference only; GlueTS forbids direct Phaser calls)
│   └── phaser-reference/
├── .claude/
│   ├── settings.json               # Claude runner: permissions + hooks + env
│   ├── rules/{systems,scenes,ui,levels,behaviour,assets,tests,design}.md     # path-scoped
│   ├── skills -> ../.agents/skills
│   └── agents/{gdd-reviewer,level-designer,playtester,art-director}.md
├── .opencode/                      # open runner: opencode.json (provider/model from stage.json), plugins/guard.ts (tool.execute.before blocks), agents/*.md
├── scripts/hooks/{session-start,protect-paths,guard-bash,post-edit,stop-gate,subagent-stop,pre-compact}.sh
├── scripts/gate.ts                 # `pnpm gate`: reads stage.json → runs that stage's gate → reports/gate-<stage>.json (also run by the worker)
├── stage.json                      # written by worker: {stage, attempt, gate, allowedWrite[], budget, runner, model, k}
└── game/                           # scaffolded per job
    ├── src/{main.ts, events.ts, scenes/, systems/, ui/}
    ├── content/{levels/*.json | arena.json + waves.json, behaviour/*.fsm.json, rules/*.eca.json, dialogue.json, progression.json}
    ├── assets/{requests.json, manifest.json, atlas/, tiles/, audio/, fonts/}
    ├── design/{concept.md, gdd.md, systems.json, style.json, deviations.md, edit-request.json}
    ├── tests/{unit/, playtest/}
    ├── reports/{gate-*.json, playtest-report.json, juice.json, budget.json, art-review.json, validation/, screenshots/, progress-notes.md}
    └── provenance.json
```

**AGENTS.md outline** (~150 lines): what this is (stage and gate are injected at session start) · commands (`pnpm typecheck|lint|test|smoke|playtest --seed|validate:levels|validate:behaviour|level:gen|level:render|juice|budget|gate|contact-sheet|preview`) · project map · non-negotiables (TypeScript only; GlueTS rules; never import Phaser, use `@gg/sdk` System API; never edit `node_modules/@gg/**` or `src/engine/**`, fork via `systems/<id>.override.ts`; randomness only via `ctx.rng`, time only via `ctx.clock`; events via `ctx.events.emit` from `src/events.ts`; levels and behaviour are data and must pass validators; assets only via `assets/manifest.json`; no network; no new deps) · gotchas (`?test=1` disables rAF; wait on `__TEST__.ready`, never sleep; headless WebGL can diverge; Phaser 4 ≠ Phaser 3; integer scaling only; placeholder keys equal final keys) · workflow and definition of done (the gate is done; evidence paths required; one feature per session; never declare done with a failing gate) · design docs are the spec · edit mode · cost discipline (scripts over reasoning; read report summaries, not logs).

**Rules** (`paths:` scoped): `systems.md` (GlueTS System interface, config from `systems.json` via generated `config.d.ts`, deterministic `fixedUpdate`, mandatory sibling test), `scenes.md` (fixed scene set; scenes own no gameplay state), `ui.md` (code-drawn via `@gg/sdk/ui`, font tokens from style, keyboard-navigable), `levels.md` (data only; `_solver` fields generated; regenerate by seed), `behaviour.md` (FSM/ECA from the genre vocabulary only; validator on write), `assets.md` (palette/resolution invariants in code terms; never edit PNG/OGG directly), `tests.md` (wait on ready; drive via `__game.step()`; assert on state before pixels; fixed seeds), `design.md` (front-matter machine-read; `gdd.md` locked after GDD stage outside edit jobs).

**Agents** (read-only or path-scoped; critic family differs from generator per policy):

| Agent | Model (policy-driven) | Tools | Purpose | Cap |
|---|---|---|---|---|
| `gdd-reviewer` | critic tier | read-only | fresh-context diff of implementation vs GDD + systems; P0/P1 gaps only | 15 turns, ≤ 40 lines |
| `level-designer` | implementation tier | Read, Write(content/**), Bash(pnpm level:*, validate:*) | generate → render → validate loop kept out of main context | 60 turns; SubagentStop exits 2 while any level fails |
| `playtester` | routing tier (escalate on low confidence) | Bash(pnpm playtest*, smoke*), Read | run bots with seeds, return top-N issues with repro seeds; never edits | 12 turns |
| `art-director` | vision critic tier | Read, Bash(pnpm contact-sheet*) | pairwise rubric critique vs style-card rubric; advisory only | 8 turns |

Not agents on purpose: the **edit-router** is one structured-output call in `apps/web` (routing tier); the **intake interview** is a Messages API tool loop (design tier) producing `concept.md` before any job exists; **data-tier stages** (levels, waves, FSMs, rules, systems.json) are direct schema-constrained API calls with k samples, not agent sessions.

**Hooks** (Claude runner `settings.json`; exit 0 = continue, exit 2 = block and feed stderr to Claude; the open runner re-implements protect-paths and guard-bash as an OpenCode plugin and relies on the worker for the Stop gate):

| Event | Matcher | Script | Behaviour |
|---|---|---|---|
| SessionStart | startup/resume/compact | `session-start.sh` | inject stage + gate command, GDD front-matter and pillars, last gate and playtest summaries, playbook entries for this genre, `progress-notes.md` tail, turns/USD remaining |
| PreToolUse | Edit/Write/MultiEdit | `protect-paths.sh` | exit 2 on `.claude/**`, `.agents/**`, `node_modules/**`, `src/engine/**`, `provenance.json`, `reports/**`, `stage.json`, or outside `stage.json.allowedWrite` |
| PreToolUse | Bash | `guard-bash.sh` | exit 2 on curl/wget/pnpm add/npm i/git push/rm -rf//sudo |
| PostToolUse | Edit/Write/MultiEdit | `post-edit.sh` | `.ts`: prettier + eslint --fix (GlueTS), remaining errors exit 2; `content/**`, `design/*.json`, `assets/requests.json`: schema + validator, exit 2 with report; `gdd.md`: check-gdd |
| Stop | — | `stop-gate.sh` | run `pnpm gate`; fail → exit 2 with ≤ 40-line summary; stall rule: same failure signature twice → exit 0 with `{passed:false, stalled:true}`; `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=5` |
| SubagentStop | level-designer | `subagent-stop.sh` | `validate:levels`; exit 2 while any fails |
| PreCompact | auto/manual | `pre-compact.sh` | append stage, gate status, open issues to `progress-notes.md` |

Permissions: allow Read/Edit/Write/Glob/Grep and `Bash(pnpm <script>*)`, `Bash(node scripts/*)`; deny WebFetch, WebSearch, curl, wget, git push, pnpm add, npm, edits to `.claude/**`, `.agents/**`, `provenance.json`, `stage.json`.

**Per-game artifacts**: `concept.md` (intake; immutable) · `style.json` (intake draft → finalised in GDD; edit:style only) · `gdd.md` (GDD stage; locked after) · `systems.json` (SYSTEMS stage; validated against catalog) · `content/**` incl. `behaviour/*.fsm.json`, `rules/*.eca.json` (data stages; validators) · `assets/requests.json` → `manifest.json` · `reports/*.json` · `deviations.md` (append-only) · `edit-request.json` · `provenance.json` (worker only).

## Generation job state machine

```
QUEUED → MATERIALIZE → GDD → SYSTEMS → SCAFFOLD ─┬→ BEHAVIOUR → IMPLEMENT → LEVELS → [join] → INTEGRATE → PLAYTEST → JUICE → REVIEW → BUDGET → PUBLISH → DONE
                                                  └→ ASSETS (assets worker, parallel) → [join]
any stage → FAILED | NEEDS_HUMAN | CANCELLED   (NEEDS_HUMAN keeps the last checkpoint playable)
```

Each stage runs the same loop: **sample k → verify → select → repair (≤ 2–3 rounds, error digest only) → escalate tier → stall**. k and tiers come from the active policy; the frontier-only policy sets k=1 and no escalation.

| Stage | Mode / tier | k (cheap policy) | Gate to advance (deterministic) | Caps (turns / USD / wall) | Checkpoint |
|---|---|---|---|---|---|
| MATERIALIZE | worker code | — | `pnpm install --offline`; empty scaffold typechecks | 0 / 0 / 2 min | no |
| GDD | agent session, design tier | 1 (2 with cheap tier; select by `check-gdd` score + pillar coverage) | `check-gdd`: required sections, exactly 3 pillars, scope within tier, feedback table parses, numeric targets; `style.json` schema | 40 / $1.50 / 10 min | gdd |
| SYSTEMS | structured call, design tier | 4 | `checkSystems`: ids in catalog, params in range, genre-required present, every GDD feedback event has a binding candidate; select by coverage score; `compose-prompts` writes asset requests | 0 / $0.50 / 5 min | systems |
| SCAFFOLD | worker (`gg scaffold`) | — | exit 0; tsc; template unit tests; placeholder atlas; smoke boots title | 0 / 0 / 3 min | scaffold |
| ASSETS (parallel) | assets worker + providers | 1–3 re-rolls | `asset-qa` (palette ≤ N, uniform pixel density, clean alpha, exact frame counts/sizes) + IP screen | 0 / $3 provider / 20 min | assets rows |
| BEHAVIOUR | structured calls, implementation tier | 4–8 per FSM/rule set | `validate:behaviour`: vocabulary only, reachable states, no dead transitions, every GDD verb bound; select by coverage, tie-break shortest | 0 / $0.50 / 5 min | behaviour |
| IMPLEMENT | agent session per bespoke system, implementation tier | 4–8 per system (one system per call, minimal context) | tsc, GlueTS eslint, vitest (template + bespoke), smoke; select by tests passed then CodeT-style agreement with model-written tests (rank only); `gdd-reviewer` zero P0 | 120 / $4 / 30 min | implement |
| LEVELS | generator seeds + level-designer, implementation tier | 8–16 seeds per level | all levels validate; ramp monotonic; first segment can't-fail; count = GDD scope; select by distance to difficulty target | 60 / $1 / 15 min | levels |
| INTEGRATE | agent session, implementation tier | 1 | manifest keys == placeholder keys; styleLint; smoke; no missing audio refs | 40 / $1 / 10 min | integrate |
| PLAYTEST | bots (code) + playtester triage (routing tier) | — | zero crashes/NaN/OOB; walker completes every level; no stuck > 5 s; metrics within GDD targets; fix loop into an IMPLEMENT-style session at most twice | 30 / $0.50 (+$2 fix) / 15 min | playtest |
| JUICE | juice-lint + agent tuning within clamps, implementation tier | 1 | juice-lint pass; feel.spec pass; clamps respected; no silent first 10 s; every core verb has SFX | 40 / $1 / 10 min | juice |
| REVIEW | gdd-reviewer (critic tier, other family) + art-director (advisory) | — | zero P0; one bounded fix session if P0 | 25 / $0.75 / 8 min | review |
| BUDGET | code | — | p95 frame ≤ 16.7 ms at 4× CPU throttle; bundle ≤ 300 KB gz (engine excluded); assets ≤ 4 MB; load ≤ 2 s; memory growth ≤ 20 MB/60 s | 0 / 0 / 5 min | no |
| PUBLISH | publisher worker (model never invoked) | — | bundle builds; goldens; thumbnail is a validated mid-play screenshot; provenance complete; manifest hash | 0 / 0 / 5 min | accepted |

Job caps: agent spend soft $10, hard $15 on the frontier policy (cheap policy soft $3, hard $5 before escalation budget); provider spend $3; wall clock 90 min. The worker accumulates per-message usage × the `@gg/llm` price table (own table for open models; the Claude SDK's `total_cost_usd` is the record for Claude runs). One fresh session per stage; stages run back-to-back on one worker so caches stay warm; failed attempts are logged to `trajectories` and scrubbed from retry context.

**Retry and escalation ladder**: gate_fail → same session keeps working (hook feedback on Claude runner; worker re-prompt on open runner), cap 5 · batch_fail (all k fail) → repair round with error digest (max 2) → escalate one tier (cheap → frontier; Sonnet → Opus) with effort +1 (max 3/stage) · validator_impossible → level-designer may adjust `systems.json` within panel ranges once, then seed bump, then stalled · asset_fail → re-roll, stronger negative prompt, substitute from placeholder pack with warning (3/asset) · budget_exceeded → NEEDS_HUMAN with last checkpoint · infra → restore checkpoint, re-run with backoff (3) · refusal → NEEDS_HUMAN. Escalation rate per stage is a tracked metric; a stage whose cheap tier escalates > 30% gets its prompts re-optimized or its model changed before the next policy version.

**Checkpoints**: every passed gate tarballs `game/` (minus node_modules/dist) + `reports/` + `stage.json` + session ids + cost ledger to the `checkpoints` bucket and inserts `game_versions(kind='stage')`. PUBLISH inserts `accepted`. Users rewind only to accepted versions; stage checkpoints GC after 7 days except the last.

**Edit routing** (no full regeneration):

```
user message → edit-router (routing tier, structured output) → {route, targets[], affected_scenes[], confidence}
route ∈ parameter | style | behaviour | content | code;  confidence < 0.7 → code (safe default), user sees the cost delta
```

| Route | What runs | Gates | Cost / time |
|---|---|---|---|
| parameter | restore head; `apply-params`; `impact.ts` reads `affects` → auto-escalate to content/style | smoke; feel.spec; walker on impacted levels; metrics-compare; budget | $0 agent; 1–3 min |
| style | `style.json` patch; only assets whose prompt hash changed regenerate; INTEGRATE-lite | styleLint; asset-qa; IP screen; smoke; regression vs new goldens on crashes/metrics | provider only; 3–10 min |
| behaviour | structured re-sample of the targeted FSM/rule sets | validate:behaviour; smoke; bots on affected systems; metrics-compare | cents; 1–3 min |
| content | level-designer on targeted files | validate targets; walker on targets; metrics-compare | ~$0.10–1; 3–6 min |
| authored content (level editor) | no router call; `apply-content` writes each edited level once the genre validator and the solver bot accept it (the same check kit the editor ran in the browser); then PLAYTEST, BUDGET, PUBLISH | validate:levels; validate:ramp; solver; smoke; budget | $0; 1–3 min |
| code | IMPLEMENT-style session scoped by `edit-request.json` with k-sampling; then LEVELS if impact says; PLAYTEST; JUICE; REVIEW; regression (zero masked diffs outside `affected_scenes`); BUDGET; PUBLISH | full ladder | $0.5–5; 10–20 min |
| remix | `fork_game` copies origin accepted source + lineage edge; optional follow-up edit job | none | $0; seconds |

## Data model (Supabase Postgres)

| Group | Tables (key columns) |
|---|---|
| Identity | `profiles` (handle, credits_balance, tester_reliability, strikes_active, plan, training_opt_out) · `credits_ledger` (delta, reason, ref_id, balance_after) |
| Games | `games` (owner_id, slug, genre, visibility, state, head_version_id, style_card_id, concept_md, concept jsonb, listing, origin_version_id, root_game_id, remix_depth, stats) · `game_versions` (game_id, number, kind stage/accepted/published, stage, parent_version_id, job_id, source_path, bundle_path, manifest, design snapshot, gate_results, evidence, engine_version, content_hash, cost_usd, policy_version, is_head) · `remix_lineage` closure table (game_id, ancestor_game_id, depth, forked_from_version_id, license) |
| Style references | `reference_catalog` (title, aliases[], card jsonb of unprotectable attributes, blocked_terms[] service-role only, risk_tier) · `reference_resolutions` (query_text private, matched_reference_id, extracted_card, confirmed_card; owner + service role only) · `style_cards` (card = style.json, source, resolution_ids private, version, prompt_prefix_hash) |
| Assets | `assets` (game_id, key, kind, status, request, storage_path, dims, frames, qa, ip_screen, attempt, provider, provider_model, prompt_hash) · `asset_provenance` (tool, model_version, prompt private, references, postprocess[], human_edits[], license_grant snapshot, commercial_ok, watermark) |
| Jobs | `generation_jobs` (kind, status, stage, stages jsonb, input, base_version_id, result_version_id, policy_version, budget caps, cost_usd, provider_cost_usd, turns, priority, worker_id, attempts, error) · `job_events` (seq, stage, type, payload; 30-day retention) · `playtest_reports` (version_id, seed, bots, summary, juice, budget, art_review, contact_sheet_path, passed) |
| Model layer | `model_policies` (version, stage → {runner, provider, model, k, escalate_to, effort, caps}, active) · `trajectories` (job_id, stage, attempt, sample_idx, runner, provider, model, prompt_hash, input_tokens, cached_tokens, output_tokens, cost_usd, duration_ms, passed, gate_report_path, failure_mode enum (MAST-style: spec_violation, repetition, context_loss, premature_done, no_verification, wrong_verification, api_misuse, schema_invalid, semantic_invalid, budget, infra), artifact_path, scrubbed bool) · `eval_cases` (prompt, genre, scope, expected_gates, origin failure/synthetic/user, source_trajectory_id, active) · `eval_runs` (policy_version, case_id, k, pass_k, cost, duration, gate_results) · `playbook_entries` (genre, stage, text, source_trajectory_id, verified bool, hits, retired_at) · `training_pairs` (stage, genre, input jsonb, output jsonb/path, verified_by gate_report_path, policy_version, exported_at) · `distill_runs` (stage, base_model, provider, pairs_count, cost, bench_pass_k, promoted bool) |
| Community | built in `0003_community.sql`: `plays` (source, duration, completed, levels, deaths) · `ratings` (one tag fun/confusing/broken/ugly per player, optional score) · `game_stats` (snapshot: per-player signals with playtime capped at 60 min/day, a player qualifying at 30 s, owner and featured/search/test/workspace traffic excluded, Bayesian quality and engagement, freshness half-life 14 days, remix bonus, rank_score, is_broken) · `test_queue` (needed reports, reward, majority outcome; a tie is broken) · `test_assignments` (claim expiry, verdict, tag, note, reward_paid). Still to come: `play_events` (positions for stuck heatmaps, sampled), `tags`/`game_tags`, tester reliability weights and label reuse |
| Moderation | `reports` (kind ip/abuse/broken, rights_holder_claim, status) · `strikes` · `takedowns` (removed/licensed/dismissed, license_terms, counter_notice) |

Buckets: `engine` (public, immutable) · `bundles` (public, immutable, separate CDN origin) · `checkpoints` (private) · `asset-raw` (private, 30-day audit) · `asset-final` (public) · `screenshots` (public) · `references` (private per user) · `trajectories` (private; prompts and outputs per sample, used by evals/optimize/distill).

Realtime: `job:<id>` broadcast from worker (tool activity, summaries, cost ticker, sample/escalation events) · `job_events` postgres_changes · `game:<id>` · `user:<id>` · `workers` presence. RPCs: `claim_job` (SKIP LOCKED), `accept_version`, `fork_game`, `record_play`, `rate_game`, `game_stats_for` (the rank formula, mirrored by `packages/db/src/ranking.ts`), `refresh_game_stats`, `feed`, `set_listed`, `enqueue_test`, `claim_test` (SKIP LOCKED), `submit_test`; community calls act as `auth.uid()`, or as the named user when the service role calls. Both migrations run on an embedded Postgres in `packages/db` tests. pg_cron: nightly stats rollup + rank_score, test_queue expiry, checkpoint GC, job_events archive, weekly eval run on the active policy.

## Game bundle contract

Bundle at `bundles/g/<game_id>/v/<version_id>/`: `index.html` (first head child is the meta CSP: `default-src 'none'`, script/img/media/font/connect limited to the CDN origin plus the bootstrap hash, `frame-ancestors` the app origin, no navigation; then the engine chunk script and inline `GG.boot(import('./game.js'), {bridge:true})`) · `manifest.json` (schema, ids, engine versions + url, entry, genre, canvas, inputs, capabilities, assets with sha256, content_hash, lineage chain, license, ai_disclosure, built_at) · `game.js` (externals resolved to `window.Phaser`/`window.GG`) · `assets/` · `content/` (levels, behaviour, rules, dialogue, progression) · `design/{systems,style}.json` · `provenance.json` (public-safe subset) · `evidence.json` · `thumbnail.png`, `cover.png`.

Test seam (SDK-provided, active with `?test=1` or bridge mode test/preview):

```ts
window.__TEST__: { ready, readyPromise, seed, build }
window.__game: {
  state(): StateSnapshot            // t, frame, scene, level, player, entities, hud, rng{seed,calls}, flags, hash
  render_game_to_text(): string
  step(n?): void                    // n fixed 60 Hz steps, synchronous (manual clock)
  advanceTime(ms): void
  setInput(partial) / press(key) / release(key)
  inputLog(): InputFrame[]; replay(log): StateSnapshot    // same seed + log ⇒ same hash
  goto(scene, {level?}); setSeed(n); reset()
  events: { on(name, cb), history() }                     // ring buffer 2,000
  metrics(): { fps, frameMsP95, drawCalls, entities, heapMB }
  runBot(name, {seed, maxSteps}): BotResult
}
```

Fixed event table: `level_start, level_complete, checkpoint, jump, land, dash, hit, damage, death, pickup, score, spawn, despawn, ui_open, ui_close, audio_play, feedback{channel: shake|hitstop|flash|particle|sfx}` plus `custom:*`. Clock: `realtime` uses rAF with a fixed-step accumulator; `manual` disables rAF so `step()` is the only way time moves. CI asserts replay-hash equality between manual headless and realtime headed runs for every template sample.

Bridge (protocol v1, zod-validated both sides): iframe `sandbox="allow-scripts"` only → frame posts `hello` → host verifies `event.source`, creates MessageChannel, replies `init` {mode, seed, locale, prefs, save blob, nickname, limits} transferring the port. Game→host: `ready`, `error`, `event` (rate-limited 20/s), `save`, `metrics` every 5 s, `screenshot`, `state`. Host→game: `pause/resume/mute/focus/destroy`, `set_params`, `set_style`, `load_level`, `load_behaviour`, `request_screenshot/state`, `mp_token` (phase 4). Invariants: frame can't navigate top, open popups, or reach the app origin; persistence and identity are decided by the host.

## Quality gates (summary, every build and edit)

Rules → visual → judge. Deterministic gates block; judges advise.

1. tsc + GlueTS eslint + prettier on every edit.
2. Template unit tests (vitest).
3. Level and behaviour validators on every save.
4. Headless seeded smoke: `__TEST__.ready`, zero console errors, every scene reachable, menus keyboard-navigable.
5. Bots: scripted per system + coverage explorer; death/stuck heatmap.
6. Juice linter: coyote, buffer, apex float, hit pause ≤ 100 ms, shake decays < 300 ms, flash/knockback/particles on hit, SFX on every verb, camera lerp + bounds, celebration ≥ 500 ms, contrast, input latency in frames, frame pacing, difficulty monotonicity, telemetry hooks; proven at runtime via `feedback` events.
7. Asset QA + provenance present.
8. Budgets.
9. Masked screenshot regression; only improving revisions.
10. Cross-family reviewer vs GDD; art-director VLM (advisory, calibrated on 50–80 labelled screenshots).
11. Worker-run gate after every session (Stop hook on the Claude runner shortens the loop).

## Style reference feature

- Curated `reference_catalog`: named game → card of unprotectable attributes. Blocked: names, characters, logos, layouts, dialogue, music, distinctive UI chrome (`blocked_terms` stripped from every prompt).
- Unknown title → LLM extraction through the same blocked-attribute filter.
- The named title is a private lookup key (`reference_resolutions`), never in asset prompts, public metadata or the game.
- Card shown and editable before generation (documents human control).
- Output IP screen (embedding similarity + OCR) at publish; strikes; licence-or-remove flow.

## Phased build plan (one dev + Claude Code)

| Phase | Weeks | Deliverables | Exit criterion |
|---|---|---|---|
| 0 Foundation | 1–4 | Monorepo + CI; `@gg/schemas` (incl. FSM/ECA/wave schemas, flat and non-recursive); `@gg/sdk` (manual/realtime clock, fixed loop, seeded RNG, event bus, FSM/ECA interpreters, GlueTS System API, test seam, bridge guest); `@gg/engine` chunk; iframe host + bridge; harness skeleton (AGENTS.md + symlinks, rules, hooks, `verify`/`playtest`/`budget-check` skills); `@gg/llm` with price table and structured-output helpers; `supabase/migrations/0001_core.sql` incl. `model_policies` and `trajectories`; `workers/generator` with the runner interface (Claude runner implemented), worker-owned gates, trajectory logging; cost telemetry | sample game boots headless with `__TEST__.ready`, zero errors; replay hash equal in manual headless vs realtime headed; a job row goes queued → done with checkpoints and a logged trajectory |
| 1 Vertical slice (frontier policy) | 5–12 | platformer + survivors templates (manifest, systems, feel presets, grammars, solvers, behaviour vocab, validators, bots, exemplars, golden samples); `gg scaffold`; all skills and agents; full stage state machine with sample-verify-select-escalate loop (k configurable), caps, checkpoints; juice linter; screenshot regression; code-drawn UI kit; ChipTone audio; Create flow UI; `tools/evals` bench (20 → 100 prompts, pass^k); frontier policy v1 (Opus/Sonnet/Haiku) and a first cheap experiment (Haiku k=8 vs Sonnet k=1 on IMPLEMENT and data stages) | 20 prompts pass all deterministic gates unattended at pass^3 ≥ 90%; measured $/game per policy; 5-person blind panel rates feel within 0.5 of golden samples |
| 2 Style, assets, cheap tier | 13–24 | style card schema + editor; reference catalog (first 300) + filter + LLM fallback; PixelLab / Retro Diffusion adapters; de-AI pass + asset QA; painted pipeline; music; provenance; IP screen; VLM rubric validated; edit router + all edit routes; parameter panels + level editor; publish + remix with lineage; **open runner (OpenCode) + cheap policy v1** (DeepSeek V4 Flash / Qwen3.6-27B / MiniMax M2.5 on BEHAVIOUR, IMPLEMENT, LEVELS, routing) with verifier-gated escalation; provider pinning + vendor tool-call verifiers in CI; `tools/optimize` (GEPA per model, feedback-rich metrics); playbook from verified trajectories; wave-2 genres | games from a named reference are visibly on-style and pass the IP screen; cheap policy reaches the same gate pass rate as frontier policy at ≤ 30% escalation and < $3/game; blind panel can't separate template assets from generated |
| 3 Community + distillation | 25–36 | feed + per-user ranking; one-tag ratings; rewarded test queue; stuck heatmaps; moderation + DMCA agent; jams; judge recalibration from tester labels; wave-3 genres; code view; `tools/distill`: LoRA 7–30B on data-tier stages from ≥ 2–5k verified pairs, benchmarked and promoted; self-host ≤35B-A3B class if volume justifies; cross-family critic standard in every policy | ranking correlates with D1/D7 return; broken games never enter the feed; distilled model matches frontier gate pass rate on its stage at ≤ 10% escalation |
| 4 Multiplayer + export | 37–52 | Colyseus room template + prediction layer; server sim in Dynamic Workers / isolated-vm; co-op variants; Steam/itch export with pre-filled disclosure; Tauri wrapper; wave-4 genres | co-op game survives packet loss and a cheating client in tests; export passes Steam disclosure |

Harness core is frozen after phase 1; genre work from then on is purely additive via the manifest; model work is purely additive via policies.

### Phase 0, first concrete steps

1. Scaffold the monorepo in `ai-game-platform` (pnpm, turbo, tsconfig base, eslint preset incl. GlueTS rules, CI).
2. `packages/schemas`: `StyleCard`, `SystemsJson`, `GddFrontmatter`, `LevelJson` (tilemap), `BehaviourFsm`, `EcaRule`, `WaveTable`, `PlaytestReport`, `BundleManifest`, bridge messages, `ModelPolicy`, `Trajectory`.
3. `packages/sdk/src/runtime/{clock.ts, loop.ts, test-seam.ts}` + `defineGame()`/`defineSystem()` + FSM/ECA interpreters + scene template; prove manual-step determinism over Phaser 4 (risk 1) with one hand-written platformer sample whose enemies run on FSM data.
4. `packages/engine`: pin Phaser 4.2.x, build the shared chunk, sync Phaser skills into `harness/.agents/skills/`.
5. `packages/bots`: Playwright smoke + contact sheet; `apps/web` play page with sandboxed iframe + bridge.
6. `harness/`: AGENTS.md + CLAUDE.md symlink, rules, `settings.json`, hook scripts, `gate.ts`, three skills, `.opencode/` stub.
7. `packages/llm` + `supabase/migrations/0001_core.sql` + `@gg/db`; `workers/generator` minimal loop: claim job → materialise → run stage via runner interface → worker gate → checkpoint → log trajectory → done.
8. `pnpm demo`: run the sample through the full gate set and print the evidence bundle.

## Verification

- Phase 0: `pnpm demo` passes; replay-hash equality test in CI; a Supabase job row completes end to end with `job_events` streamed and a `trajectories` row written.
- Phase 1: `pnpm bench` (20 → 100 prompts) reports pass rate per gate, pass^3, cost and wall time per policy; becomes the regression suite for every harness change. Blind feel panel (5 testers, golden vs generated, 1–5 scale, target mean within 0.5).
- Phase 2: same bench run under the cheap policy must match the frontier policy's gate pass rate; escalation rate, $/game and pass^3 reported per stage; GEPA runs must show a measured delta on the bench before promotion.
- Phase 3: distilled model benchmarked on its stage before promotion; weekly eval run on the active policy via pg_cron.
- Every later phase: bench pass rate may not drop; cost per passing game tracked against telemetry.

## Highest-risk choices (tracked)

1. **Manual-step determinism over Phaser 4's loop.** Tweens, timers, particles consume real delta; every gate rests on `step()` and replay equality. Mitigation: SDK owns the loop and wraps tweens/timers in SDK time; phase 0 exit criterion.
2. **Shared engine chunk + strict meta-CSP in opaque-origin iframe.** Externals build complexity, engine version matrix served forever, CSP mistakes break assets silently. Mitigation: engine version pinned in manifest; `republish` migration job; CSP generated from one template with a Playwright test per release.
3. **Genre manifest proven on two dissimilar grammars.** Survivors has no "levels". Mitigation: build survivors before any platformer shortcut lands in `core/`; CI completeness test per manifest.
4. **Competence floor and the "regardless of model" expectation.** Sub-7B models may stay unusable; same-harness first-pass success drops 5–15 points on open models. Mitigation: policy-level escalation makes the final bar model-independent; cost and escalation rate are the variables; bench proves it per policy before promotion.
5. **Harness portability.** Hooks and subagent definitions don't port across harnesses; the Claude Agent SDK is Claude-only. Mitigation: worker owns gates, canonical AGENTS.md and `.agents/skills`, structured data stages bypass the agent harness, OpenCode plugin re-implements path and bash guards.
6. **Provider fidelity for open models.** Tool-call parsing and schema adherence vary by host (under 20% parsed on one stock vLLM setup; 55% on one fp8 host). Mitigation: provider pinning, vendor verifiers in CI, model-specific parsers, llguidance-constrained JSON, semantic gates.
7. **Edit routing instead of regeneration.** A misrouted parameter edit reproduces "changing one rule breaks the game". Mitigation: mandatory, tested `affects` metadata; `impact.ts` auto-escalates; regression admits only non-regressing metrics; low confidence defaults to code route.
8. **Structured-output limits.** Anthropic structured outputs reject recursive schemas and numeric bounds; engine coverage collapses on deep schemas. Mitigation: schemas are flat, split per artifact, and validated semantically after decoding.
9. **Style card has no precedent**; A/B card vs raw reference image in phase 2. **Vendor terms unconfirmed** (PixelLab, Retro Diffusion, Lyria, ElevenLabs Music; open-model licences such as GLM-5.3's revenue clause); get written terms before the phase 2 cost model. **VLM critic unproven**; advisory until validated. **Benchmarks are vendor-run**; promote models only on our own same-harness bench.
