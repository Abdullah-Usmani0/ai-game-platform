import type { Exemplar } from '@gg/template-core';
import { CHASER } from './behaviours.js';
import { generateWaves } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A basic enemy that runs at the player and staggers when hit.', artifact: CHASER },
  { kind: 'waves', prompt: 'A gentle 60-second ramp of chasers with a few brutes late.', artifact: generateWaves({ seed: 1, difficulty: 0.4 }) },
  { kind: 'waves', prompt: 'A frantic 60-second run with heavy pressure from the start.', artifact: generateWaves({ seed: 2, difficulty: 0.9 }) },
  {
    kind: 'systems',
    prompt: 'A classic survivors arena: auto-attack, waves, xp pickups, 60-second runs.',
    artifact: { version: 1, genre: 'survivors', feelPreset: 'arena-melee', systems: [{ id: 'movement-topdown', params: {} }, { id: 'auto-attack', params: { range: 40, damage: 1, cooldownTicks: 30 } }, { id: 'spawner', params: { maxAlive: 80 } }, { id: 'pickups', params: { value: 1 } }, { id: 'survival', params: { winAtS: 60 } }] },
  },
];
