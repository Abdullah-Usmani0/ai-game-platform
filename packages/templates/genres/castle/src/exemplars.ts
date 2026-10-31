import type { Exemplar } from '@gg/template-core';
import { ARCHER, GARGOYLE, GHOUL, HEADSMAN, HOUND, SENTINEL, WRAITH } from './behaviours.js';
import { generateRegion } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A ghoul that shambles along its floor and lurches at the player who comes close.', artifact: GHOUL },
  { kind: 'behaviour', prompt: 'A crypt hound that crouches, then bounds at the player in low leaps.', artifact: HOUND },
  { kind: 'behaviour', prompt: 'A stone watcher that wakes when the player comes near and spits embers.', artifact: GARGOYLE },
  { kind: 'behaviour', prompt: 'A shield-bearer that advances behind its shield and thrusts its spear at the player in reach.', artifact: SENTINEL },
  { kind: 'behaviour', prompt: 'A wraith that drifts at the player, casts a slow hex, then fades through them to cast again.', artifact: WRAITH },
  { kind: 'behaviour', prompt: 'A bone archer that keeps its distance, drawing and loosing arrows at the player.', artifact: ARCHER },
  { kind: 'behaviour', prompt: 'A boss, a giant executioner: rises when the player comes, chops, leaps and sends waves along the floor, and at half health roars and fights faster.', artifact: HEADSMAN },
  { kind: 'level', prompt: 'A first wing: the wings behind the start, a hall, an altar, and a ledge only a double jump climbs.', artifact: generateRegion({ seed: 11, difficulty: 0.15 }) },
  { kind: 'level', prompt: 'A full region on two floors: wings, an altar, the ledge, halls and the boots above; a shaft down to a second altar, then back below past a chasm only the dash crosses and the hall where the boss waits, to the way out, where a gate in the ceiling opens a shortcut up to the first altar.', artifact: generateRegion({ seed: 23, difficulty: 0.55 }) },
  {
    kind: 'systems',
    prompt: 'A castle explorer where relics unlock the double jump and the dash, altars save the way, with souls and a sword.',
    artifact: {
      version: 1,
      genre: 'castle',
      feelPreset: 'castle-agile',
      systems: [
        { id: 'combat', params: {} },
        { id: 'movement-castle', params: {} },
        { id: 'relics', params: { relicScore: 25 } },
        { id: 'abilities', params: {} },
        { id: 'rooms', params: {} },
        { id: 'rest', params: { reach: 8 } },
        { id: 'shortcuts', params: {} },
        { id: 'arena', params: {} },
        { id: 'hazards', params: { respawnDelayTicks: 30 } },
        { id: 'pickups', params: { value: 1 } },
        { id: 'goal', params: { bonus: 20 } },
      ],
    },
  },
];
