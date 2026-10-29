import { describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: queryMock }));

import { ClaudeSdkRunner } from './claude-sdk.js';
import type { StageContext } from './types.js';

const stream = (list: unknown[]) =>
  (async function* () {
    for (const m of list) yield m;
  })();

function ctx(partial: Partial<StageContext> = {}): StageContext {
  return {
    jobId: 'job1',
    gameId: 'game1',
    spec: { stage: 'implement', gate: ['typecheck'], task: 'Implement the hook mechanic.' },
    attempt: 1,
    workDir: '/work/job1',
    gameDir: '/work/job1/game',
    policy: { runner: 'claude-sdk', provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'high', k: 1, repairRounds: 2, caps: { turns: 40, usd: 1.5, wallMin: 10 } },
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    store: {} as StageContext['store'],
    log: () => {},
    dryRun: false,
    request: null,
    route: null,
    edit: null,
    versionId: 'v1',
    ...partial,
  };
}

describe('ClaudeSdkRunner (mocked Agent SDK)', () => {
  it('runs one session with the policy caps and records usage, cost and turns from the result message', async () => {
    queryMock.mockReturnValueOnce(
      stream([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it.' }] } },
        { type: 'result', subtype: 'success', result: 'Ran pnpm gate: passed. Reports in game/reports.', usage: { input_tokens: 1000, cache_read_input_tokens: 4000, cache_creation_input_tokens: 500, output_tokens: 300 }, total_cost_usd: 0.42, num_turns: 7 },
      ]),
    );
    const out = await new ClaudeSdkRunner().run(ctx());
    expect(out.ok).toBe(true);
    expect(out.summary).toContain('pnpm gate');
    expect(out.costUsd).toBe(0.42);
    expect(out.turns).toBe(7);
    expect(out.usage).toEqual({ inputTokens: 5500, outputTokens: 300, cachedTokens: 4000, cacheWriteTokens: 500 });
    expect(out.promptHash).toMatch(/^[0-9a-f]{16}$/);
    const call = queryMock.mock.calls[0]![0] as { prompt: string; options: Record<string, unknown> };
    expect(call.prompt).toContain('Implement the hook mechanic.');
    expect(call.prompt).toContain('pnpm gate');
    expect(call.options).toMatchObject({ cwd: '/work/job1', model: 'claude-sonnet-5-5', effort: 'high', maxTurns: 40, maxBudgetUsd: 1.5, permissionMode: 'dontAsk', settingSources: ['project'] });
    expect((call.options['env'] as Record<string, string>)['GG_STAGE']).toBe('implement');
  });
  it('maps turn and budget exhaustion to the budget failure mode and keeps the last assistant text', async () => {
    queryMock.mockReturnValueOnce(
      stream([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'still fixing lint' }] } },
        { type: 'result', subtype: 'error_max_turns', usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 10 }, total_cost_usd: 1.5, num_turns: 40 },
      ]),
    );
    const out = await new ClaudeSdkRunner().run(ctx());
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('budget');
    expect(out.summary).toContain('error_max_turns');
    expect(out.summary).toContain('still fixing lint');
  });
  it('treats a session that ends without a result message as an infrastructure failure', async () => {
    queryMock.mockReturnValueOnce(stream([{ type: 'system', subtype: 'init' }]));
    const out = await new ClaudeSdkRunner().run(ctx({ policy: null }));
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('infra');
    const call = queryMock.mock.calls[queryMock.mock.calls.length - 1]![0] as { options: Record<string, unknown> };
    expect(call.options).toMatchObject({ maxTurns: 60, maxBudgetUsd: 2, effort: 'medium' });
  });
});
