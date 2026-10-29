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
