import type { Exemplar } from '@gg/template-core';
import { HOPPER, TURRET, WALKER } from './behaviours.js';
import { generateExplore } from './level/generate.js';

export const EXEMPLARS: Exemplar[] = [
  { kind: 'behaviour', prompt: 'A cave crawler that patrols its ledge and chases the player when close.', artifact: WALKER },
  { kind: 'behaviour', prompt: 'A spore that waits and then hops at the player.', artifact: HOPPER },
  { kind: 'behaviour', prompt: 'A sentry that shoots when the player comes into range.', artifact: TURRET },
  { kind: 'level', prompt: 'A first cavern: wings behind the start, a cliff, a key on a pillar and a locked door.', artifact: generateExplore({ seed: 11, difficulty: 0.15 }) },
  { kind: 'level', prompt: 'A full cavern: wings, cliff, key and door, boots and a long spike pit, a sentry before the exit.', artifact: generateExplore({ seed: 23, difficulty: 0.55 }) },
  {
    kind: 'systems',
    prompt: 'A cave explorer where relics unlock the double jump and the dash, with coins and stomping.',
    artifact: {
      version: 1,
      genre: 'metroidvania',
      feelPreset: 'celeste-class',
      systems: [
        { id: 'movement-metroidvania', params: {} },
        { id: 'relics', params: { relicScore: 25 } },
        { id: 'hazards', params: { respawnDelayTicks: 30 } },
        { id: 'combat-stomp', params: {} },
        { id: 'pickups', params: { value: 1 } },
        { id: 'goal', params: { bonus: 20 } },
      ],
    },
  },
];
