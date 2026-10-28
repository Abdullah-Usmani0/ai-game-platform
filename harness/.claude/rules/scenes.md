---
paths: ["game/src/scenes/**", "game/src/main.ts"]
---
# Scenes and entry

- The scene set is fixed by the SDK (title, play, results). Scenes own no gameplay state; they render the sim.
- `main.ts` is scaffolded from the template and wires `createGame`; do not edit it. Change behaviour through systems and data.
