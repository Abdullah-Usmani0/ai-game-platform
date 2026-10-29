// Wiring only: the system code is the platformer's checked movement system, built in its gated mode.
import { createMovement } from '@gg/template-platformer';

/** Platformer movement with the abilities gated: the dash needs the boots relic (one per airtime), wings add an air jump. */
export const movement = createMovement({ id: 'movement-metroidvania', gated: true });

export const meta = {
  id: 'movement-metroidvania',
  genres: ['metroidvania'],
  required: true,
  summary: 'Platformer movement whose abilities are earned: the dash needs the boots relic (one dash per airtime) and the wings relic grants one air jump. Feel from the preset.',
  params: {},
  emits: ['jump', 'land', 'dash'],
  feedbackFor: ['jump', 'land', 'dash'],
  controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' },
  provides: { movement: 'platformer' },
} as const;
