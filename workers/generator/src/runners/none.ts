import type { Runner, StageContext, StageOutcome } from './types.js';

/** Gate-only stage: no model call. Used for smoke/verification stages and the demo. */
export class NoneRunner implements Runner {
  readonly kind = 'none' as const;
  async run(ctx: StageContext): Promise<StageOutcome> {
    ctx.log(`stage ${ctx.spec.stage}: gate-only (no model)`);
    return { ok: true, summary: 'gate-only stage', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: 0, turns: 0 };
  }
}
