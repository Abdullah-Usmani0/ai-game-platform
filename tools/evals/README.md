# Evals bench

`pnpm bench` runs the benchmark prompts in `prompts.json` through the create pipeline and grades every run with the same
gates the product uses. Dry runs (default) call no model: the fake provider returns exemplar artifacts, so the result
measures the harness itself (scaffold, solver, smoke, juice, budget, publish) and must stay at pass^k = 1.0.
Live runs (`--live --policy policies/<file>.json`) need `ANTHROPIC_API_KEY` (or an OpenAI-compatible endpoint) and
measure a model policy: pass^k, per-stage first-try rate, cost per passing game.

```
pnpm bench                                  # all 20 prompts, k=3, dry
pnpm bench --limit 2 --k 1                  # quick CI smoke (one prompt per genre)
pnpm bench --live --policy policies/frontier-v1.json --k 3
pnpm bench --live --policy policies/cheap-experiment-v1.json --genre survivors
```

Reports land in `reports/` as JSON; compare `summary.perStage` across policies before promoting one.
