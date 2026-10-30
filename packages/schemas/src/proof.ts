import { z } from 'zod';
import { Id } from './common';

const Held = z.boolean().optional();

/** One held input of a recorded run: the keys pressed for ticks [from, to) (the SDK's InputSegment). */
export const ScriptSegment = z
  .object({
    from: z.int().min(0),
    to: z.int().min(1),
    input: z.strictObject({ left: Held, right: Held, up: Held, down: Held, jump: Held, dash: Held, action: Held, pause: Held }),
  })
  .refine((s) => s.to > s.from, 'a segment holds for at least one tick');
export type ScriptSegment = z.infer<typeof ScriptSegment>;

/**
 * content/proofs/<level>.json: a recorded run that wins a level at the seed it is played with, the evidence that the
 * level can be finished. The gate and the browser replay it; a level without one is not listed.
 */
export const LevelProof = z.object({
  version: z.literal(1),
  /** The level's id. */
  level: Id,
  /** The seed the level is played at (1 + its index). */
  seed: z.int(),
  /** Ticks from the start to the win. */
  ticks: z.int().min(1).max(216000),
  /** Who found the run: the base genre's solver bot, the explorer, a model-written bot or a human tester. */
  by: z.enum(['solver', 'explorer', 'bot', 'human']),
  script: z.array(ScriptSegment).max(50000),
});
export type LevelProof = z.infer<typeof LevelProof>;

/** One step on the way to a level's win: be near a tile (within r tiles), or get a HUD number (or the score) to a value. */
export const HintStep = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reach'), x: z.int().min(0).max(4096), y: z.int().min(0).max(4096), r: z.int().min(0).max(16).default(1) }),
  z.object({ kind: z.literal('hud_at_least'), key: z.string().min(1).max(32), value: z.number().min(0).max(1e9) }),
]);
export type HintStep = z.infer<typeof HintStep>;

/**
 * content/hints/<level>.json: the steps of a level's win, in order, for the explorer to climb when it cannot find the
 * win alone (the key behind a long detour, the lever before the door). Written from the level; a run found with them
 * is a proof like any other.
 */
export const LevelHints = z.object({
  version: z.literal(1),
  /** The level's id. */
  level: Id,
  steps: z.array(HintStep).min(1).max(12),
});
export type LevelHints = z.infer<typeof LevelHints>;

/** A player's winning run on a level its version waits for, as the play page sends it to be replayed on that version. */
export const ProofSubmission = z.object({
  versionId: z.string().min(1).max(64),
  proof: LevelProof.extend({ by: z.literal('human') }),
});
export type ProofSubmission = z.infer<typeof ProofSubmission>;
