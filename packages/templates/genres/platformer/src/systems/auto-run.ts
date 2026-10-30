import { defineSystem, type FeelPreset } from '@gg/sdk';

/** The prop on the player that side-view movement runs at while it is set: a runner's speed in px/s, signed. */
export const RUN_SPEED = 'runSpeed';

/** The fastest a runner gets, as a share of the feel's top speed, however long its pace has been rising. */
export const MAX_PACE = 1.6;

/** Side-view levels are laid out in tiles of 8 px. */
const TILE_PX = 8;

/**
 * A runner: the player runs right on their own and never stops, at a pace of the feel's top speed that can rise as the
 * level goes on; left and right do nothing, the jump and the dash are the player's. The movement runs at the speed this
 * sets on the player, so a runner keeps the feel's acceleration, air control and jump boost.
 */
export const autoRun = defineSystem<Record<string, never>>({
  id: 'auto-run',
  init(ctx) {
    // From the first tick, whichever system moves first, and over a speed carried from the level before.
    ctx.world.player.props[RUN_SPEED] = runSpeed(ctx.params, ctx.feel, 0);
    return {};
  },
  fixedUpdate(_s, _input, ctx) {
    ctx.world.player.props[RUN_SPEED] = runSpeed(ctx.params, ctx.feel, ctx.tick);
  },
});

/** A runner's speed in px/s, a number of ticks into the level. */
export function runSpeed(params: Readonly<Record<string, unknown>>, feel: Pick<FeelPreset, 'maxRun'>, tick: number): number {
  const pace = Number(params['pace'] ?? 1) + (Number(params['rampPerMin'] ?? 0) * tick) / 3600;
  return feel.maxRun * Math.min(MAX_PACE, pace);
}

/**
 * How long a runner's level is, in tiles: as far as it runs in the given seconds at its starting pace, between 48 and
 * 400 tiles. A runner never stops, so a level of the grammar's usual length would be over in seconds.
 */
export function runLevelLength(params: Readonly<Record<string, unknown>>, feel: Pick<FeelPreset, 'maxRun'>, seconds: number): number {
  return Math.max(48, Math.min(400, Math.round((seconds * runSpeed(params, feel, 0)) / TILE_PX)));
}

export const meta = {
  id: 'auto-run',
  // Only freeform games compose it: the platformer's solver plans as a player who can stop and turn back.
  genres: ['freeform'],
  summary:
    'A runner: the player runs right on their own and never stops, at a pace of the top speed that can rise each minute; left and right do nothing, jump and dash stay. Its levels are as long as the GDD level time at that pace.',
  params: {
    pace: { type: 'number', min: 0.7, max: 1.4, default: 1, affects: 'levels' },
    rampPerMin: { type: 'number', min: 0, max: 0.5, default: 0, affects: 'levels' },
  },
  emits: [],
  feedbackFor: [],
  controls: {},
  takesOver: ['left', 'right'],
  requires: { movement: ['platformer'] },
  // A runner cannot turn back, and an ability-gated map is won by going back for what it held.
  conflicts: ['movement-metroidvania'],
} as const;
