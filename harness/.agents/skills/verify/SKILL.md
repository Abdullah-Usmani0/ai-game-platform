---
name: verify
description: How to launch, drive and inspect the game to confirm a change actually works in the real build (not just in unit tests). Use before declaring any feature done.
---
# Verify a change in the real build

1. `pnpm -C game build` (produces `game/dist` with `index.html`, `engine.js`, `game.js`).
2. `pnpm exec gg-bots smoke game/dist --seed 1 --ticks 600 --replay-check --out game/reports`
   - fails on any console or page error, if `__TEST__.ready` never fires, or if the manual, realtime and in-page replay hashes differ.
3. Look at `game/reports/smoke-seed1-tick600.png` and `game/reports/playtest-report.json`. Open and inspect the screenshot; do not assume.
4. For a longer look: `pnpm exec gg-bots contact-sheet game/dist --seed 1 --frames 12 --out game/reports` and read the sheet.
5. Prefer state over pixels: `window.__game.render_game_to_text()` and `window.__game.events.count('jump')` are the oracles.

If a capture looks wrong, re-run once before trusting it (headless WebGL can diverge from GPU output).
