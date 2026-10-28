import type { Exemplar } from '@gg/template-core';
import { ARCHER, GRUNT } from './behaviours.js';
import { generateRooms } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A melee enemy that waits in its room, rushes on sight and staggers when hit.', artifact: GRUNT },
  { kind: 'behaviour', prompt: 'A ranged enemy that keeps its distance and shoots, retreating when the player closes in.', artifact: ARCHER },
  { kind: 'level', prompt: 'An easy two-room start: an empty entry room and one room with a couple of grunts before the exit.', artifact: generateRooms({ seed: 7, difficulty: 0.2 }) },
  { kind: 'level', prompt: 'A mid-run floor: three rooms across, archers behind cover, a brute guarding the exit.', artifact: generateRooms({ seed: 19, difficulty: 0.6 }) },
  {
    kind: 'systems',
    prompt: 'A room-clearing action game: directional melee, dash, lock the exit until every enemy is dead, gems for score.',
    artifact: { version: 1, genre: 'topdown-action', feelPreset: 'room-melee', systems: [{ id: 'movement-topdown', params: {} }, { id: 'melee-attack', params: { damage: 1, range: 14, cooldownTicks: 18 } }, { id: 'room-clear', params: { bonus: 20 } }, { id: 'pickups', params: { value: 2 } }] },
  },
];
