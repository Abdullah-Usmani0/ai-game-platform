---
paths: ["game/src/ui/**"]
---
# UI

- UI chrome is drawn in code through `@gg/sdk` helpers, never as raster assets. Fonts and colours come from `style.json` tokens.
- Every menu is keyboard-navigable; the HUD respects the safe area; no text smaller than the style card's base size.
