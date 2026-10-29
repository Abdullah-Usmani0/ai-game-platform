import { z } from 'zod';

/** Host <-> game iframe protocol v1 over a MessageChannel. */
export const BRIDGE_PROTOCOL = 1;

export const StateSnapshot = z.object({
  tick: z.int().nonnegative(),
  scene: z.string(),
  level: z.string().nullable(),
  player: z.record(z.string(), z.unknown()),
  entities: z.array(z.record(z.string(), z.unknown())),
  hud: z.record(z.string(), z.unknown()),
  rng: z.object({ seed: z.int(), calls: z.int().nonnegative() }),
  flags: z.object({ paused: z.boolean(), gameOver: z.boolean(), won: z.boolean() }),
  /** Present only while an in-game menu is open: its id, the highlighted option and the option ids. */
  menu: z.object({ id: z.string(), selected: z.int(), options: z.array(z.string()) }).optional(),
  hash: z.string(),
});
export type StateSnapshot = z.infer<typeof StateSnapshot>;

const Prefs = z.object({
  reduceShake: z.boolean().default(false),
  colorblind: z.boolean().default(false),
  mute: z.boolean().default(false),
});

export const GameToHost = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), protocol: z.literal(BRIDGE_PROTOCOL), gameId: z.string(), versionId: z.string(), engine: z.string() }),
  z.object({ type: z.literal('ready'), scenes: z.array(z.string()), levels: z.array(z.string()) }),
  z.object({ type: z.literal('error'), message: z.string(), stack: z.string().optional(), fatal: z.boolean() }),
  z.object({ type: z.literal('event'), name: z.string(), payload: z.record(z.string(), z.unknown()), tick: z.int() }),
  z.object({ type: z.literal('save'), blob: z.string() }),
  z.object({ type: z.literal('metrics'), fps: z.number(), frameMsP95: z.number(), heapMB: z.number() }),
  z.object({ type: z.literal('screenshot'), png: z.string() }),
  z.object({ type: z.literal('state'), state: StateSnapshot }),
]);
export type GameToHost = z.infer<typeof GameToHost>;

export const HostToGame = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    mode: z.enum(['play', 'preview', 'test']),
    seed: z.int().optional(),
    locale: z.string().default('en'),
    prefs: Prefs.default({ reduceShake: false, colorblind: false, mute: false }),
    save: z.string().optional(),
    player: z.object({ nickname: z.string().max(32) }).default({ nickname: 'player' }),
    limits: z.object({ saveBytes: z.int().positive() }).default({ saveBytes: 65536 }),
  }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('mute'), muted: z.boolean() }),
  z.object({ type: z.literal('focus'), focused: z.boolean() }),
  z.object({ type: z.literal('destroy') }),
  z.object({ type: z.literal('set_params'), patch: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('set_style'), patch: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('load_level'), level: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('load_behaviour'), behaviour: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('request_screenshot') }),
  z.object({ type: z.literal('request_state') }),
]);
export type HostToGame = z.infer<typeof HostToGame>;
