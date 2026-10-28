import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { promptHash } from '@gg/llm';
import type { Runner, StageContext, StageOutcome } from './types.js';

function stagePrompt(ctx: StageContext): string {
  const task = ctx.spec.task ?? `Complete the '${ctx.spec.stage}' stage for this game.`;
  return [
    `You are running the '${ctx.spec.stage}' stage (attempt ${ctx.attempt}).`,
    'Read the stage summary injected at session start, then AGENTS.md if anything is unclear.',
    `Task: ${task}`,
    'Work only inside the write scope. Finish by running `pnpm gate`; it must pass before you stop.',
    'Final message: the commands you ran and the report paths, at most ten lines.',
  ].join('\n');
}

/**
 * Runs one Claude Code session inside the materialised harness. The harness's own hooks enforce
 * path and command guards; the worker still runs the gate afterwards regardless of the session's claims.
 */
export class ClaudeSdkRunner implements Runner {
  readonly kind = 'claude-sdk' as const;

  async run(ctx: StageContext): Promise<StageOutcome> {
    const t0 = Date.now();
    const prompt = stagePrompt(ctx);
    const caps = ctx.policy?.caps ?? { turns: 60, usd: 2, wallMin: 20 };
    const effort = ctx.policy?.effort ?? 'medium';
    let summary = '';
    let outcome: StageOutcome | null = null;
    const stream = query({
      prompt,
      options: {
        cwd: ctx.workDir,
        model: ctx.model,
        effort,
        maxTurns: caps.turns || undefined,
        maxBudgetUsd: caps.usd || undefined,
        permissionMode: 'dontAsk',
        settingSources: ['project'],
        env: { ...process.env, GG_STAGE: ctx.spec.stage, GG_JOB_ID: ctx.jobId } as Record<string, string>,
      },
    });
    for await (const msg of stream as AsyncIterable<SDKMessage>) {
      if (msg.type === 'assistant') {
        const blocks = msg.message.content as Array<{ type: string; text?: string }>;
        const text = blocks
          .filter((c) => c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text as string)
          .join('\n');
        if (text) summary = text.slice(-2000);
      } else if (msg.type === 'result') {
        const usage = {
          inputTokens: msg.usage.input_tokens + msg.usage.cache_read_input_tokens + msg.usage.cache_creation_input_tokens,
          outputTokens: msg.usage.output_tokens,
          cachedTokens: msg.usage.cache_read_input_tokens,
          cacheWriteTokens: msg.usage.cache_creation_input_tokens,
        };
        if (msg.subtype === 'success') {
          outcome = { ok: true, summary: msg.result || summary, usage, costUsd: msg.total_cost_usd, durationMs: Date.now() - t0, turns: msg.num_turns, promptHash: promptHash('', prompt, ctx.spec.stage) };
        } else {
          const failureMode = msg.subtype === 'error_max_turns' || msg.subtype === 'error_max_budget_usd' ? 'budget' : 'infra';
          outcome = { ok: false, summary: `${msg.subtype}: ${summary}`, usage, costUsd: msg.total_cost_usd, durationMs: Date.now() - t0, turns: msg.num_turns, failureMode, promptHash: promptHash('', prompt, ctx.spec.stage) };
        }
      }
    }
    return outcome ?? { ok: false, summary: 'no result message from the agent session', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: Date.now() - t0, turns: 0, failureMode: 'infra' };
  }
}
