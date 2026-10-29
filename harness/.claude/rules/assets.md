---
paths: ["game/assets/**", "game/design/style.json"]
---
# Assets and style

- `style.json` governs canvas size, palette roles, outline rule, animation fps, camera and typography. Code reads it; it never reads code.
- Pixel-art families render with `pixelArt: true`, nearest filtering and integer zoom. Never edit PNG or OGG files by hand; the pipeline regenerates them.
- Reference assets only by keys in `assets/manifest.json`; request new ones in `assets/requests.json` (schema-checked).
- The renderer draws everything from `style.json`: sprites, terrain, sky and HUD are recoloured from the palette roles, outlined by the `outline` rule, animated at `animationFps`, and `postFx` turns on the vignette, bloom and scanlines. A palette change restyles the whole game; no code changes.
