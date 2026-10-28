---
name: asset-prompting
description: Request art and audio assets through game/assets/requests.json under the style card, and work with placeholder assets until the pipeline delivers finals. Phase 1 ships code-drawn placeholders only.
---
# Assets

Phase 1 games are code-drawn: tiles, entities and UI render from `design/style.json` palette roles. Do not add raster files.
To request generated assets (later phases), append to `game/assets/requests.json`: `{ key, kind: sprite|tileset|audio_sfx|music|ui, description, frames?, size? }`.
Keys must match the placeholder keys in `assets/manifest.json` so the final swap never touches code.
Check status with `node --import tsx .agents/skills/asset-prompting/scripts/asset-status.ts`.
