# Model-agnostic quality: research notes (Oct 2026)

Question: how can the harness produce frontier-quality 2D games on cheaper or open-weight models? Four research passes: verifier-driven techniques, open/cheap models and harnesses, DSL and constrained generation, multi-agent evidence. Many primary hosts (arxiv, vendor pricing pages) were blocked from the sandbox; numbers come from abstracts, repos and secondary summaries and are marked vendor or independent where known. Items flagged "unverified" in the original reports are omitted or noted.

## Bottom line

Nothing supports "same quality regardless of model" below a competence floor (roughly 7B+ coder-class). Above it, the evidence supports a harness where quality comes from: small structured outputs, a deterministic verifier that selects among samples and triggers escalation, knowledge curated by a frontier model and filtered by verifiers, per-model prompt optimization, and distillation on verified data. The pipeline's existing design (typed templates, validators, playtest bots) is close to the best case in the literature.

## 1. Verifier-driven inference (strongest lever)

| Technique | Evidence | Source |
|---|---|---|
| Best-of-N with executable tests | CodeRM-8B: +18.4 pts for Llama3-8B on HumanEval+, +5.0 for Llama3-70B, +3.4 for GPT-4o-mini (gains largest for weakest model) | https://arxiv.org/html/2501.01054v1 |
| Sampling + debug + execution-based selection (S*) | Qwen2.5-Coder-3B + S* beats GPT-4o-mini; GPT-4o-mini + S* beats o1-preview by 3.7% on LiveCodeBench; R1-Distill-32B + S* 85.7% vs o1-high 88.5%; defaults N=16, 3 debug rounds | https://huggingface.co/papers/2502.14382 |
| Repeated sampling coverage | SWE-bench Lite 15.9% (1 sample) → 56% (250 samples) with DeepSeek-Coder-V2, oracle verifier only; majority vote / reward models plateau; Pythia models 0% even at 10k samples (floor) | https://arxiv.org/abs/2407.21787 |
| CodeMonkeys | 57.4% SWE-bench Verified at ~$4.60/issue; local Qwen2.5-Coder-32B for context reads, verifier-ranked samples for edits | https://arxiv.org/pdf/2501.14723 |
| Verifier quality warning | PRM-guided search advantage vanishes by 16 samples and falls below plain sampling at 32 with imperfect verifiers; rank with deterministic checks first | https://arxiv.org/abs/2502.00271v1 |
| Compute-optimal test-time scaling | small model + search beats a 14× larger model only on easy/medium problems where the small model has non-trivial base success | https://arxiv.org/abs/2408.03314 |
| Test-first / agreement | CodeT: +4.2–13.1 pts for 6B–16B models; TiCoder 48% → 85% with confirmed tests; property-based feedback +23–37% relative | https://arxiv.org/abs/2207.10397v2, https://arxiv.org/pdf/2208.05950, https://arxiv.org/html/2506.18315v1 |
| Weak-model tests are noisy | weaker families need lower pass thresholds because their own tests produce false negatives; use model-written tests as a ranking signal, never the sole gate | https://arxiv.org/abs/2405.15842v2 |

Rules of thumb: 5–16 samples capture most of the win when a deterministic verifier exists; 50–250 only pay with a reliable verifier.

## 2. Structure shrinks the gap (DSL, schemas, constrained decoding)

| Finding | Evidence | Source |
|---|---|---|
| Grammar-constrained game DSL helps small models most | Ludii GDG: +36.0 compilability / +31.0 functionality for Llama-3.2-3B→3-8B pair; much smaller 8B→GPT-4o gain | https://arxiv.org/abs/2407.17404 |
| Constrained decoding fixes validity, not semantics | 0.6B–4B models: schema validity 78.6–92.9% → 100%; semantic (multi-step) errors remain and are scale-dependent | https://arxiv.org/pdf/2609.23742 |
| Engine API is the failure mode | 10,400 single-pass attempts, 7B–30B models: zero generated Unity C# scenes compiled; IR-as-data gives mechanism F1 up to 1.0 vs 0.12 for free code | https://arxiv.org/abs/2607.10187, https://arxiv.org/abs/2605.07342 |
| Oversized schemas choke small models | full-scene IR conditioning caused 96–99% timeouts on 7B models; keep schemas small, flat, split per artifact | https://arxiv.org/abs/2603.07101 |
| Type-constrained decoding for TypeScript | compile errors cut by >50% across Gemma-2 2B to CodeLlama-34B; syntax is only ~6–9% of TS compile errors, types matter | https://arxiv.org/abs/2504.09246 |
| Engines | llguidance ~50 µs/token, widest JSON Schema coverage; XGrammar default in vLLM/SGLang, heavy precompute on big schemas; Outlines weakest on hard schemas; GitHub-Hard coverage Guidance 41% vs Outlines 3% (secondary) | https://github.com/guidance-ai/llguidance, https://github.com/mlc-ai/xgrammar, https://arxiv.org/abs/2501.10868 |
| Provider limits | Anthropic structured outputs: no recursive schemas, no numeric bounds, `additionalProperties:false` required, 24 h compiled-grammar cache | https://platform.claude.com/docs/en/build-with-claude/structured-outputs |
| "Let me speak freely" dispute | well-designed schemas (reasoning field before answer fields) are neutral-to-positive even at 8B; answer-first JSON-mode prompting hurts reasoning tasks | https://arxiv.org/abs/2408.02442, https://blog.dottxt.ai/say-what-you-mean.html |
| Behaviour as data | fine-tuned Gemma-3 4B: 100% valid behaviour-tree XML, 87% sim success where base models produced 0% valid; PuzzleScript (ScriptDoctor) and VGDL loops rely on solver/search validation, not model judgment (GPT-4o wins 10% of GVGAI levels) | https://www.alphaxiv.org/overview/2603.06084, https://arxiv.org/abs/2506.06524, https://arxiv.org/abs/2508.08501 |
| Solver sets level quality | MarioGPT 88.4% A*-completable vs 31% baseline; WFC+GA 73% fewer unplayable levels; Sturgeon/ASP guarantee properties by construction | https://arxiv.org/pdf/2302.05981, https://www.iccs-meeting.org/archive/iccs2025/papers/159090105.pdf |
| Lua/TS/Python for small models | Lua is "remarkably good" despite low frequency; a 1B model fine-tuned on Lua reaches base-15B pass@1; Roblox Cube 4D routes behaviour through schemas, not model-written Luau | https://arxiv.org/pdf/2308.09895, https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model |

## 3. Knowledge, prompt optimization, distillation

| Finding | Evidence | Source |
|---|---|---|
| Curated skills help, self-authored hurt | SkillsBench: curated skills +16.2 pp average; self-generated skills −1.3 pp; strong-agent-synthesized skills improve weaker agents up to 54.3% (SkillWeaver) | https://arxiv.org/pdf/2602.12670, https://arxiv.org/abs/2504.07079v1 |
| Retrieval is not a free lift for weak models | CodeRAG-Bench: generators "face limitations in using those contexts effectively"; curate exemplars offline | https://arxiv.org/abs/2406.14497v1 |
| DSPy / MIPROv2 | llama2-13b-chat 9% → 47% on a compiled program; MIPROv2 up to +13% with Llama-3-8B | https://arxiv.org/abs/2310.03714v1, https://arxiv.org/abs/2406.11695v1 |
| GEPA | beats GRPO by 6–10% with up to 35× fewer rollouts on Qwen3-8B; Databricks (vendor): gpt-oss-120b + GEPA ≈ unoptimized Opus 4.1 at ~90× lower cost, optimized frontier still +6–7 pts | https://www.alphaxiv.org/abs/2507.19457v2, https://www.databricks.com/blog/building-state-art-enterprise-agents-90x-cheaper-automated-prompt-optimization |
| ACE (agentic context engineering) | +10.6% agents / +8.6% finance; DeepSeek-V3.1 + ACE matches the top production AppWorld agent; incremental playbook deltas avoid context collapse | https://huggingface.co/papers/2510.04618 |
| Distillation on narrow tasks | LoRA Land (vendor): LoRA'd 7B beat GPT-4 by 10 pts avg on 31 tasks, <$8 per model; SWE-smith: 5,016 verifier-filtered trajectories → 40.2% SWE-bench Verified for a 32B (+32%); rStar-Coder 7B 17.4% → 57.3% LiveCodeBench with verified data | https://arxiv.org/abs/2405.00732v1, https://arxiv.org/pdf/2504.21798, https://arxiv.org/pdf/2505.21297 |
| Fine-tuning prices (third-party listings, verify) | Fireworks LoRA SFT ~$0.50/M training tokens ≤16B; Together ~$0.48/M; 10k examples × 1k tokens × 3 epochs ≈ $15 | https://support.together.ai/articles/7922061943-fine-tuning-pricing |
| Cascades vs routers | verifier-gated cascades: 26% avg / up to 70% cost cut at equal accuracy; EcoAssistant +10 pts at under half GPT-4 cost; learned routers rarely beat trivial baselines (RouterBench, LLMRouterBench 2026) | https://arxiv.org/abs/2405.15842v2, https://arxiv.org/abs/2601.07206 |

## 4. Multi-agent and context evidence

| Finding | Evidence | Source |
|---|---|---|
| Failure taxonomy | MAST: 14 failure modes; failures stem from system design and inter-agent misalignment; MAS gains over single agents often minimal | https://arxiv.org/abs/2503.13657 |
| Topology | Google 180-config study: multi-agent degrades sequential tasks 39–70%, centralized coordination +80.9% on parallelizable tasks; independent agents amplify errors 17.2× vs 4.4× | https://arxiv.org/abs/2512.08296 |
| Single writer, parallel readers | Cognition: parallel writers make conflicting implicit decisions (Flappy Bird example); what works is a clean-context reviewer and consultant | https://cognition.ai/blog/dont-build-multi-agents, https://cognition.ai/blog/multi-agents-working |
| Token cost | Anthropic: agents ~4× chat tokens, multi-agent ~15×; token usage explains 80% of variance on BrowseComp | https://www.anthropic.com/engineering/multi-agent-research-system |
| Self-correction needs an external signal | LLMs cannot self-correct reasoning without oracle feedback; small models need strong verifiers; Reflexion MBPP fell 0.80 → 0.77 from false-positive self-written tests | https://arxiv.org/abs/2310.01798, https://arxiv.org/abs/2404.17140, https://arxiv.org/abs/2303.11366 |
| Debate / MoA | MAD fails to reliably beat self-consistency; Self-MoA: repeated samples from the best model beat mixed-model MoA; heterogeneity helps only the critic role | https://arxiv.org/abs/2502.08788, https://arxiv.org/abs/2502.00674 |
| Role-heavy pipelines on open models | MapCoder on Qwen2.5-32B: 27.5 h, 6.7M tokens, 3,095 calls over CodeContests; AdaCoder (generate + script-tested, debug only on failure) +27.7% pass@1 over MapCoder at 12× fewer tokens | https://arxiv.org/abs/2509.17489, https://arxiv.org/abs/2504.04220 |
| Context rot | all 18 models degrade with input length; 11 of 13 below 50% of short-context baseline at 32K without literal matches; focused ~300-token inputs beat full history | https://research.trychroma.com/context-rot, https://proceedings.mlr.press/v267/modarressi25a.html |
| Harness guidance | CLAUDE.md < 200 lines, skills with progressive disclosure, deterministic hooks for must-hold rules, Stop hook exit 2, one feature per session, browser-driven verification, evals of 20–50 real failures with pass^k | https://code.claude.com/docs/en/best-practices, https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents, https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents |
| Judges | Agent-as-a-Judge 90% agreement with humans vs 70% for LLM-as-judge; small judges markedly lower agreement (κ 0.65 vs 0.88 in one 2026 audit); self-preference bias documented | https://arxiv.org/abs/2410.10934, https://arxiv.org/abs/2410.21819 |

## 5. Open models and harnesses (Oct 2026 snapshot; vendor numbers unless noted)

| Model | Params | License | Agentic coding (vendor unless noted) | Hosted price in/out per M |
|---|---|---|---|---|
| Qwen3.6-27B (dense) | 27B | Apache-2.0 | SWE-bench Verified 77.2 (Opus 4.5 80.9); TB 2.0 59.3 | self-host on 1–2 GPUs |
| Qwen3.6-35B-A3B | 35B/3B | Apache-2.0 | SWE-bench Verified 73.4 | self-host |
| DeepSeek V4 Flash / V4.1 Flash | 284B/13B | MIT | V4-Pro 80.6 SWE-V (secondary) | DeepInfra $0.09/$0.18 |
| MiniMax M2.5 | ~230B/10B | modified MIT | SWE-bench Verified 80.2; on OpenCode 76.1 vs Opus 4.6 75.9 | $0.15/$1.20 official |
| GLM-5.2 / 5.3 | 744B/40B | MIT / custom (5.3) | SWE-bench Pro 62.1 (also on Scale's board); TB 2.1 81.0 | $1.40/$4.40 US hosts |
| Kimi K3 | 2.8T/104B | MIT-like with MaaS clause | TB 2.1 88.3 (vendor) | not public |
| gpt-oss-120b | 117B/5.1B | Apache-2.0 | Aider polyglot 41.8%, 79.1% well-formed edits (independent) | DeepInfra $0.037/$0.17 |
| Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5 | — | — | reference | $0.10/$0.50, $2/$10, $4/$20; cache hits 5% of input |

Independent same-harness picture: Terminal-Bench 2.0 top open-weight entries rank 11–16 behind frontier-closed; ICLR 2026 Terminal-Bench paper had a ~27-point gap at launch; harness choice alone moves scores 3–16 points (same model, different tool). Hosting fidelity: stock vLLM parsed under 20% of Kimi K2 tool calls before template fixes; one fp8 host hit 55.5% finish-tool-calls on MiniMax M2.1. Sources: https://llm-stats.com/benchmarks/terminal-bench-2, https://proceedings.iclr.cc/paper_files/paper/2026/file/444a3737adaee10d86ad2ef5f74468e6-Paper-Conference.pdf, https://raw.githubusercontent.com/vllm-project/vllm-project.github.io/main/_posts/2025-10-28-Kimi-K2-Accuracy.md, https://github.com/MiniMax-AI/MiniMax-Provider-Verifier.

Harnesses: the Claude Agent SDK officially supports Claude models only; proxies strip structured outputs (https://code.claude.com/docs/en/llm-gateway, https://github.com/anthropics/claude-agent-sdk-python/issues/410). Model-agnostic options with Claude-Code-like features: OpenCode (reads CLAUDE.md and `.claude/skills`, 75+ providers, plugin hooks, HTTP SDK; https://github.com/sst/opencode), Qwen Code (Claude-shaped hooks incl. Stop/SubagentStop; https://github.com/QwenLM/qwen-code), OpenHands SDK (LiteLLM, structured output, hooks, delegation, REST server; https://github.com/OpenHands/software-agent-sdk), Pi (30+ providers, extensions; https://github.com/badlogic/pi-mono). Agent Skills is an open standard most harnesses read from `.agents/skills` (https://github.com/agentskills/agentskills).

Self-hosting: DeepSeek-class MoE on H200 clusters sustains ~2.2k tokens/s per GPU (~$0.50/M at 100% utilization); only the ≤35B-active-3B class beats hosted open-model APIs at realistic utilization (https://raw.githubusercontent.com/vllm-project/vllm-project.github.io/main/_posts/2025-12-17-large-scale-serving.md). Free tiers cap at 50–1,500 requests/day and are for development only.

## 6. Implications adopted in the system plan

1. Three output tiers (data under flat schemas, restricted glue TypeScript, never engine API).
2. Sample → verify → select → repair → escalate at every stage; k from a versioned per-stage model policy.
3. Structured outputs for all data artifacts; schemas flat, split, non-recursive, reasoning field first.
4. Skills, exemplars and playbook written by frontier model and humans from verified trajectories.
5. Harness portability: AGENTS.md canonical, `.agents/skills`, worker-owned gates, two runners (Claude SDK, OpenCode).
6. GEPA/MIPROv2 per model with feedback-rich metrics from gate reports.
7. Distillation flywheel from verified pairs once 2–5k exist per stage.
8. Cross-family critic; small judges only for validated rubric checks.
9. Evals with pass^k; failure modes labelled and converted into regression cases, validators or playbook deltas.
10. Single writer, parallel read-only agents, code-owned control loop.
