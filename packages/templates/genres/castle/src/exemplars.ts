import type { Exemplar } from '@gg/template-core';
import { GARGOYLE, GHOUL, HOUND } from './behaviours.js';
import { generateRegion } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A ghoul that shambles along its floor and lurches at the player who comes close.', artifact: GHOUL },
  { kind: 'behaviour', prompt: 'A crypt hound that crouches, then bounds at the player in low leaps.', artifact: HOUND },
  { kind: 'behaviour', prompt: 'A stone watcher that wakes when the player comes near and spits embers.', artifact: GARGOYLE },
  { kind: 'level', prompt: 'A first wing: the wings behind the start, a hall, an altar, and a ledge only a double jump climbs.', artifact: generateRegion({ seed: 11, difficulty: 0.15 }) },
  { kind: 'level', prompt: 'A full region: wings, an altar, the ledge, halls, the boots, a second altar, a descent, a chasm only the dash crosses, the way out.', artifact: generateRegion({ seed: 23, difficulty: 0.55 }) },
  {
    kind: 'systems',
    prompt: 'A castle explorer where relics unlock the double jump and the dash, altars save the way, with souls and stomping.',
    artifact: {
      version: 1,
      genre: 'castle',
      feelPreset: 'castle-agile',
      systems: [
        { id: 'movement-castle', params: {} },
        { id: 'relics', params: { relicScore: 25 } },
        { id: 'abilities', params: {} },
        { id: 'rooms', params: {} },
        { id: 'rest', params: { reach: 8 } },
        { id: 'hazards', params: { respawnDelayTicks: 30 } },
        { id: 'combat-stomp', params: { bounceVy: -140 } },
        { id: 'pickups', params: { value: 1 } },
        { id: 'goal', params: { bonus: 20 } },
      ],
    },
  },
];
