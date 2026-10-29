import type { Exemplar } from '@gg/template-core';
import { ARCHER, GRUNT, WARDEN } from './behaviours.js';
import { generateRooms } from './level/generate.js';

/** The first systems exemplar is what a dry run builds: the full Hades-like set. */
export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A melee enemy that waits in its room, rushes on sight and staggers when hit.', artifact: GRUNT },
  { kind: 'behaviour', prompt: 'A ranged enemy that keeps its distance and shoots, retreating when the player closes in.', artifact: ARCHER },
  { kind: 'level', prompt: 'An easy two-room start: an empty entry room and one room with a couple of grunts before the exit.', artifact: generateRooms({ seed: 7, difficulty: 0.2 }) },
  { kind: 'level', prompt: 'A mid-run floor: three rooms across, archers behind cover, a brute guarding the exit.', artifact: generateRooms({ seed: 19, difficulty: 0.6 }) },
  { kind: 'level', prompt: "The last floor: a few guarded rooms, then the boss's lair at the end with the exit behind it.", artifact: generateRooms({ seed: 51, difficulty: 0.55, boss: 1 }) },
  { kind: 'behaviour', prompt: 'A boss that slams up close after a long wind-up, fires rings of embers at range and enrages at half health.', artifact: WARDEN },
  {
    kind: 'systems',
    prompt: 'A Hades-like dungeon run: a three-hit combo with a finisher, a dash you can strike out of and that dodges through attacks, and a boon to choose after every floor.',
    artifact: {
      version: 1,
      genre: 'topdown-action',
      feelPreset: 'room-melee',
      systems: [
        { id: 'movement-topdown', params: { dashInvuln: true } },
        { id: 'melee-attack', params: { damage: 1, range: 14, cooldownTicks: 18, combo: true, dashStrike: true, finisherBonus: 1 } },
        { id: 'room-clear', params: { bonus: 20 } },
        { id: 'pickups', params: { value: 2 } },
        { id: 'boons', params: { enabled: true } },
      ],
    },
  },
  {
    kind: 'systems',
    prompt: 'A room-clearing action game: directional melee, dash, lock the exit until every enemy is dead, gems for score.',
    artifact: { version: 1, genre: 'topdown-action', feelPreset: 'room-melee', systems: [{ id: 'movement-topdown', params: {} }, { id: 'melee-attack', params: { damage: 1, range: 14, cooldownTicks: 18 } }, { id: 'room-clear', params: { bonus: 20 } }, { id: 'pickups', params: { value: 2 } }] },
  },
];
