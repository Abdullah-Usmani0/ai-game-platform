// Wiring only: the system code is the platformer's checked movement system, built in its gated mode.
import { createMovement } from '@gg/template-platformer';

/** Platformer movement with the abilities gated, as the metroidvania's: wings add an air jump, boots the dash. */
export const movement = createMovement({ id: 'movement-castle', gated: true });

export const meta = {
  id: 'movement-castle',
  genres: ['castle'],
  required: true,
  summary: 'Side-view movement for a tall hero on 16 px tiles, its abilities earned: the wings relic grants one air jump, the boots relic the dash (one per airtime). Feel from the castle presets.',
  params: {},
  emits: ['jump', 'land', 'dash'],
  feedbackFor: ['jump', 'land', 'dash'],
  controls: { left: 'run', right: 'run', jump: 'jump', dash: 'dash' },
  provides: { movement: 'platformer' },
} as const;
