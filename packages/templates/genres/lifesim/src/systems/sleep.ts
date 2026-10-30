import { defineSystem } from '@gg/sdk';
import { entityAt, facedTile, facingStart, track, type Facing } from './farm-kit.js';
import { FARM_TYPES, typeParam } from './rules.js';

interface SleepState {
  facing: Facing;
  /** Asleep from the moment the player chooses to sleep until the next morning: the bed asks nothing meanwhile. */
  asleep: boolean;
}

/**
 * The bed. Facing it, the action key asks whether to sleep; sleeping ends the day (custom:sleep, which the day clock
 * answers), and not yet, or dash, goes back to work. Once asleep, the bed asks nothing more until morning, so a key
 * pressed again on the way to sleep cannot end the next day too.
 */
export const sleep = defineSystem<SleepState>({
  id: 'sleep',
  init: () => ({ facing: facingStart(), asleep: false }),
  fixedUpdate(s, input, ctx) {
    if (!ctx.world.player.alive) return;
    const pressed = track(s.facing, input, ctx.tick);
    if (!pressed.action || s.asleep) return;
    const { tx, ty } = facedTile(ctx, s.facing);
    if (!entityAt(ctx, typeParam(ctx, 'bedType', FARM_TYPES.bed), tx, ty)) return;
    ctx.openMenu({
      id: 'bed',
      title: 'Go to bed?',
      options: [
        { id: 'sleep', label: 'Sleep', detail: 'End the day: watered crops grow and the bin pays overnight', icon: 'moon' },
        { id: 'stay', label: 'Not yet', detail: 'Back to work' },
      ],
      cancellable: true,
    });
  },
  onEvent(s, ev, ctx) {
    if (ev.name === 'menu_choose' && ev.payload['menu'] === 'bed' && ev.payload['option'] === 'sleep') {
      s.asleep = true;
      ctx.emit('custom:sleep', { day: ctx.world.hud['day'] ?? null });
    } else if (ev.name === 'custom:day_start') s.asleep = false;
  },
});

export const meta = {
  id: 'sleep',
  genres: ['lifesim'],
  summary: 'A bed: facing it, action asks to sleep; sleeping ends the day.',
  params: { bedType: { type: 'string', default: FARM_TYPES.bed, affects: 'none', composed: 'entity' } },
  emits: ['menu_open', 'menu_choose', 'custom:sleep'],
  feedbackFor: ['custom:sleep'],
  controls: { left: 'face', right: 'face', up: 'face', down: 'face', action: 'work' },
  requires: { movement: ['topdown'], roles: ['bed'], systems: ['day-clock'] },
} as const;
