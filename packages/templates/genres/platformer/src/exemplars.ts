import type { Exemplar } from '@gg/template-core';
import { HOPPER, TURRET, WALKER } from './behaviours.js';
import { generateLevel } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A ground enemy that patrols a ledge and chases the player when close.', artifact: WALKER },
  { kind: 'behaviour', prompt: 'An enemy that waits and then hops toward the player.', artifact: HOPPER },
  { kind: 'behaviour', prompt: 'A stationary enemy that shoots when the player is in range.', artifact: TURRET },
  { kind: 'level', prompt: 'An easy first level: a few gaps, one step, coins on a ledge, one walker.', artifact: generateLevel({ seed: 11, difficulty: 0.15 }) },
  { kind: 'level', prompt: 'A mid-difficulty level with wider pits, a two-tile wall and two enemies.', artifact: generateLevel({ seed: 23, difficulty: 0.55 }) },
  {
    kind: 'systems',
    prompt: 'A tight cave platformer with coins, stomping and hazards.',
    artifact: { version: 1, genre: 'platformer', feelPreset: 'celeste-class', systems: [{ id: 'movement-platformer', params: {} }, { id: 'hazards', params: { respawnDelayTicks: 30 } }, { id: 'combat-stomp', params: {} }, { id: 'pickups', params: { value: 1 } }, { id: 'goal', params: { bonus: 10 } }] },
  },
];
