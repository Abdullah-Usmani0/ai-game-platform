import type { Exemplar } from '@gg/template-core';
import { DRONE, TANK } from './behaviours.js';
import { generateWaves } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A light enemy that dives, weaves and fires aimed shots, leaving at the bottom.', artifact: DRONE },
  { kind: 'behaviour', prompt: 'A slow armoured enemy that descends straight and fires often.', artifact: TANK },
  { kind: 'waves', prompt: 'A gentle minute: a few drones per wave, one tank late, a power-up every fifteen seconds.', artifact: generateWaves({ seed: 1, difficulty: 0.3 }) },
  { kind: 'waves', prompt: 'A dense minute: drone swarms from the start and paired tanks after the midpoint.', artifact: generateWaves({ seed: 2, difficulty: 0.8 }) },
  {
    kind: 'systems',
    prompt: 'A classic vertical shooter: hold to fire, dodge aimed bullets, survive the minute.',
    artifact: { version: 1, genre: 'shmup', feelPreset: 'arcade-ship', systems: [{ id: 'movement-topdown', params: {} }, { id: 'player-shooter', params: { fireCooldownTicks: 8, damage: 1, spread: 1 } }, { id: 'spawner', params: { maxAlive: 40 } }, { id: 'pickups', params: { value: 5 } }, { id: 'survival', params: { winAtS: 60 } }] },
  },
];
