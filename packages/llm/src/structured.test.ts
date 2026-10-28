import { describe, expect, it } from 'vitest';
import { costUsd } from './pricing.js';
import type { Provider, StructuredRequest, StructuredResponse } from './provider.js';
import { generateArtifact } from './structured.js';

/** A fake provider that returns scripted outputs in order, to exercise sample/verify/repair/select without a network. */
function fakeProvider(outputs: unknown[]): Provider & { calls: StructuredRequest[] } {
  const calls: StructuredRequest[] = [];
  return {
    name: 'fake',
    calls,
    async structured(req): Promise<StructuredResponse> {
      calls.push(req);
      const data = outputs.shift();
      return { data, usage: { inputTokens: 100, outputTokens: 50 } };
    },
    async text() {
      return { text: '', usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}

const goodFsm = (speed: number) => ({
  version: 1,
  id: 'walker',
  initial: 'patrol',
  states: { patrol: { update: [{ kind: 'patrol', speed }], transitions: [] } },
});

describe('generateArtifact', () => {
  it('rejects schema-invalid samples, repairs with the issue digest, and selects by score', async () => {
    const provider = fakeProvider([
      { version: 1, id: 'walker', initial: 'nowhere', states: {} }, // invalid: initial not defined
      goodFsm(10), // repair round output
    ]);
    const res = await generateArtifact<{ states: Record<string, { update: Array<{ speed?: number }> }> }>({
      provider,
      model: 'claude-haiku-5-5',
      artifact: 'BehaviourFsm',
      system: 'sys',
      prompt: 'make a walker',
      k: 1,
      repairRounds: 1,
    });
    expect(res.samples.length).toBe(2);
    expect(res.samples[0]?.ok).toBe(false);
    expect(res.selected?.ok).toBe(true);
    expect(provider.calls[1]?.prompt).toContain('rejected for these reasons');
    // The digest names the problem; the failed artifact itself is never echoed back.
    expect(provider.calls[1]?.prompt).not.toContain('"states"');
    expect(res.totalCostUsd).toBeCloseTo(costUsd('claude-haiku-5-5', { inputTokens: 100, outputTokens: 50 }) * 2, 6);
  });

  it('applies the deterministic verifier and picks the highest-scoring accepted sample', async () => {
    const provider = fakeProvider([goodFsm(10), goodFsm(500), goodFsm(40)]);
    const res = await generateArtifact<{ states: Record<string, { update: Array<{ speed?: number }> }> }>({
      provider,
      model: 'claude-haiku-5-5',
      artifact: 'BehaviourFsm',
      system: 'sys',
      prompt: 'make a walker',
      k: 3,
      repairRounds: 0,
      verify: (v) => (Object.values(v.states).some((s) => s.update.some((a) => (a.speed ?? 0) > 200)) ? ['too fast for the genre'] : []),
      score: (v) => Object.values(v.states)[0]?.update[0]?.speed ?? 0,
    });
    expect(res.samples.filter((s) => s.ok).length).toBe(2);
    expect(res.selected?.value?.states['patrol']?.update[0]?.speed).toBe(40);
  });

  it('returns null selection when every sample and repair fails (caller escalates)', async () => {
    const provider = fakeProvider([{ bad: true }, { bad: true }]);
    const res = await generateArtifact({ provider, model: 'x', artifact: 'WaveTable', system: 's', prompt: 'p', k: 1, repairRounds: 1 });
    expect(res.selected).toBeNull();
    expect(res.samples.length).toBe(2);
  });
});

describe('costUsd', () => {
  it('prices cached reads at the cache rate', () => {
    expect(costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(2);
    expect(costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, cachedTokens: 1_000_000, outputTokens: 0 })).toBe(0.1);
    expect(costUsd('unknown-model', { inputTokens: 10, outputTokens: 10 })).toBe(0);
  });
});
