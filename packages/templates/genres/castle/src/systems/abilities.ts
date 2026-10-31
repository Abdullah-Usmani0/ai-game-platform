import { defineSystem } from '@gg/sdk';
import { ABILITIES } from '../entities.js';

/** The prop an ability lasts as: a rest's save keeps the player's props, and a region loaded from it reads them back. */
export const AB_PREFIX = 'ab:';

/**
 * Abilities that last: an ability flag the player earns (a relic's) is also kept as a prop, and a level that starts
 * with the prop (a region loaded from a rest, the next region) starts with the ability.
 */
export const abilities = defineSystem<{ kept: number }>({
  id: 'abilities',
  init(ctx) {
    const p = ctx.world.player;
    let kept = 0;
    for (const a of ABILITIES) {
      if (p.props[AB_PREFIX + a] !== true) continue;
      p.flags[a] = true;
      kept++;
    }
    return { kept };
  },
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    for (const a of ABILITIES) {
      if (p.flags[a] !== true || p.props[AB_PREFIX + a] === true) continue;
      p.props[AB_PREFIX + a] = true;
      s.kept++;
    }
  },
});

export const meta = {
  id: 'abilities',
  genres: ['castle'],
  required: true,
  summary: 'Earned abilities last: kept with the player\'s props, so a rest\'s save and the next region keep the double jump and the dash.',
  params: {},
  emits: [],
  feedbackFor: [],
  controls: {},
  hud: [],
} as const;
