---
name: behaviour-author
description: Define enemy and interactable behaviour as data (BehaviourFsm files under game/content/behaviour/ and EcaRule files under game/content/rules/) using only the genre vocabulary. Use in the BEHAVIOUR stage and behaviour edits.
---
# Behaviour as data

1. Print the vocabulary: `node --import tsx .agents/skills/behaviour-author/scripts/vocab.ts <genre>` (conditions and actions this genre accepts, plus the default FSMs as examples).
2. Write `game/content/behaviour/<id>.fsm.json` (`BehaviourFsm`): `version: 1`, `id`, one-line `designNotes` first, `initial`, `states: { name: { onEnter, update, transitions: [{ to, when }] } }`.
   - Two to five states. Every state should be reachable and (unless terminal by design) leave.
   - `when` is one condition or `{ kind: 'all'|'any', of: [...] }` (one level only).
   - A hit that lands at once (`damage_player`) comes after a wind-up the player can read: the state that hits is
     entered only from a state that plays `windup` (or `aim`) and leaves on `timer_elapsed` of 150 ms or more, and is
     never the initial state. Shots need none (they are dodged in flight). The validator refuses an unannounced hit.
   - A game with moves (`game/content/moves.json`: a castle game's claws, pounces and spits) attacks through them: a
     state that plays a move's clip (`play_anim` with the move's `anim`, for an entity type that owns the move) makes
     that move, with its own wind-up, boxes and shot. Turn to face the player as it enters (`move_toward_player` at
     speed 0), move nothing in its update (the move carries the body), and leave only once the move is over:
     `timer_elapsed` of its length plus a tick, in ms, or on `took_damage`. The validator refuses a move state that moves
     itself or leaves early.
3. Entity types bind to an FSM through `entityDefs` (`fsm: '<id>'`); use the ids the genre already defines (walker, hopper, turret, chaser) or request a new entity type via `design/deviations.md`.
4. Global rules: `game/content/rules/<id>.eca.json` (`EcaRule`): `on` an event, optional `if` leaf conditions (evaluated on the player), `do` actions on the player.
5. Validate every file: `pnpm validate game/content/behaviour/<id>.fsm.json` (schema + structure) and render: `node --import tsx .agents/skills/behaviour-author/scripts/render-fsm.ts <file>`.
