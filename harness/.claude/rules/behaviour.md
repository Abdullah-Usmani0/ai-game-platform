---
paths: ["game/content/behaviour/**", "game/content/rules/**"]
---
# Behaviour as data

- Enemy and interactable behaviour is a `BehaviourFsm` (states, transitions, actions) and global rules are `EcaRule` files.
- Only the vocabulary in `@gg/schemas` exists: conditions (`player_within`, `timer_elapsed`, `hit_wall`, `at_ledge`, ...) and actions (`patrol`, `move_toward_player`, `jump`, `shoot`, `emit`, ...).
- Keep FSMs small (2 to 5 states). Put a one-line `designNotes` first. Validate with `pnpm validate <file>` on every write.
