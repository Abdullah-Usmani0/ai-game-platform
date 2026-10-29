import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerProvider, type ChatRequest, type ChatResponse, type Provider } from '@gg/llm';
import { describe, expect, it } from 'vitest';
import { bashDecision, writeDecision } from '../guards.js';
import { OpenRunner } from './open.js';
import type { StageContext } from './types.js';

function scripted(responses: Array<Partial<ChatResponse>>): Provider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    name: 'fake-chat',
    requests,
    async structured() {
      throw new Error('not used');
    },
    async text() {
      return { text: '', usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async chat(req) {
      requests.push(structuredClone(req));
      const r = responses.shift() ?? {};
      return { text: r.text ?? '', toolCalls: r.toolCalls ?? [], usage: r.usage ?? { inputTokens: 1000, outputTokens: 100 }, stop: r.stop ?? ((r.toolCalls?.length ?? 0) > 0 ? 'tool' : 'end') };
    },
  };
}

function harness(): { workDir: string; gameDir: string } {
  const workDir = mkdtempSync(join(tmpdir(), 'gg-open-'));
  writeFileSync(join(workDir, 'AGENTS.md'), '# Game project harness\nRules: GlueTS only.');
  writeFileSync(join(workDir, 'stage.json'), JSON.stringify({ stage: 'implement', task: 'Add a hook mechanic.' }));
  mkdirSync(join(workDir, '.agents', 'skills', 'mechanic-author'), { recursive: true });
  writeFileSync(join(workDir, '.agents', 'skills', 'mechanic-author', 'SKILL.md'), '# mechanic-author\nUse defineSystem.');
  mkdirSync(join(workDir, '.agents', 'skills', 'playbook', 'entries'), { recursive: true });
  writeFileSync(join(workDir, '.agents', 'skills', 'playbook', 'entries', 'platformer.md'), '- Emit land once per landing.');
  const gameDir = join(workDir, 'game');
  mkdirSync(join(gameDir, 'design'), { recursive: true });
  mkdirSync(join(gameDir, 'src', 'systems'), { recursive: true });
  writeFileSync(join(gameDir, 'design', 'gdd.md'), '---\n{"title":"T","genre":"platformer"}\n---\n## Concept\n');
  writeFileSync(join(gameDir, 'design', 'systems.json'), JSON.stringify({ version: 1, genre: 'platformer', feelPreset: 'celeste-class', systems: [] }));
  return { workDir, gameDir };
}

function ctxFor(workDir: string, gameDir: string): StageContext {
  return {
    jobId: 'j1',
    gameId: 'g1',
    spec: { stage: 'implement', gate: ['typecheck', 'lint'], allowedWrite: ['game/src/systems/**', 'game/tests/**'], skills: ['mechanic-author'], task: 'Add a hook mechanic.' },
    attempt: 1,
    workDir,
    gameDir,
    policy: { runner: 'open', provider: 'fake-chat', model: 'qwen3.6-27b', effort: 'medium', k: 1, repairRounds: 1, caps: { turns: 10, usd: 1, wallMin: 5 } },
    model: 'qwen3.6-27b',
    provider: 'fake-chat',
    store: {} as StageContext['store'],
    log: () => {},
    dryRun: false,
    request: null,
    route: null,
    edit: null,
    versionId: 'v1',
  };
}

describe('guards', () => {
  it('protects harness paths and enforces the write scope', () => {
    expect(writeDecision('game/src/systems/hook.ts', ['game/src/systems/**']).ok).toBe(true);
    expect(writeDecision('game/design/gdd.md', ['game/src/systems/**']).ok).toBe(false);
    expect(writeDecision('.claude/settings.json', []).ok).toBe(false);
    expect(writeDecision('game/reports/x.json', []).ok).toBe(false);
    expect(writeDecision('../outside.txt', []).ok).toBe(false);
    expect(writeDecision('game/content/levels/L01.json', ['game/content/**']).ok).toBe(true);
  });
  it('allows the harness commands and blocks the rest', () => {
    for (const ok of ['pnpm gate', 'pnpm validate game/content/levels/L01-l01.json', 'pnpm -C game test', 'pnpm -C game exec vitest run tests/unit/game.test.ts', 'pnpm exec gg-bots smoke game/dist --seed 1 --ticks 600 --replay-check --out game/reports', 'pnpm catalog platformer', 'pnpm catalog freeform survivors', 'node --import tsx .agents/skills/level-design/scripts/render-level.ts game/content/levels/L01-l01.json', 'cat game/design/gdd.md', 'grep -n defineSystem game/src/systems/hook.ts']) expect(bashDecision(ok).ok, ok).toBe(true);
    for (const bad of ['curl http://x', 'pnpm add left-pad', 'git push origin main', 'rm -rf /', 'pnpm gate && curl x', 'node scripts/evil.js', 'npm install', 'sudo ls']) expect(bashDecision(bad).ok, bad).toBe(false);
  });
});

describe('OpenRunner', () => {
  it('runs a guarded tool loop: reads, scoped writes, allowed commands, refusals, finish', async () => {
    const { workDir, gameDir } = harness();
    const commands: string[] = [];
    const provider = scripted([
      { text: 'Let me look around.', toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'AGENTS.md' } }, { id: 'c2', name: 'list_dir', input: { path: 'game' } }] },
      { toolCalls: [{ id: 'c3', name: 'write_file', input: { path: 'game/src/systems/hook.ts', content: 'export const hook = 1;\n' } }, { id: 'c4', name: 'write_file', input: { path: 'game/design/gdd.md', content: 'hacked' } }] },
      { toolCalls: [{ id: 'c5', name: 'bash', input: { command: 'curl http://evil' } }, { id: 'c6', name: 'bash', input: { command: 'pnpm gate' } }, { id: 'c7', name: 'read_file', input: { path: '.claude/settings.json' } }] },
      { text: 'Done.', toolCalls: [{ id: 'c8', name: 'finish', input: { summary: 'Added hook.ts; pnpm gate passed.' } }] },
    ]);
    registerProvider('fake-chat', provider);
    const runner = new OpenRunner({ exec: (command) => (commands.push(command), { ok: true, out: 'GATE PASSED' }) });
    const out = await runner.run(ctxFor(workDir, gameDir));
    expect(out.ok).toBe(true);
    expect(out.summary).toContain('Added hook.ts');
    expect(out.turns).toBe(4);
    expect(out.usage.inputTokens).toBe(4000);
    expect(existsSync(join(gameDir, 'src', 'systems', 'hook.ts'))).toBe(true);
    expect(readFileSync(join(gameDir, 'design', 'gdd.md'), 'utf8')).not.toContain('hacked');
    expect(commands).toEqual(['pnpm gate']);
    // The system prompt carries AGENTS.md, the stage, the skill and the playbook; tool results carry the refusals.
    const first = provider.requests[0]!;
    expect(first.system).toContain('Game project harness');
    expect(first.system).toContain('Stage: implement');
    expect(first.system).toContain('Skill: mechanic-author');
    expect(first.system).toContain('Playbook (platformer)');
    expect(first.tools.map((t) => t.name)).toEqual(['read_file', 'write_file', 'list_dir', 'bash', 'finish']);
    const toolMessages = provider.requests[3]!.messages.filter((m) => m.role === 'tool').map((m) => m.content);
    expect(toolMessages.some((m) => m.startsWith('# Game project harness'))).toBe(true);
    expect(toolMessages.filter((m) => m.startsWith('Blocked:')).length).toBe(2);
    expect(toolMessages.some((m) => m.includes('GATE PASSED'))).toBe(true);
  });
  it('stops on the usd cap and reports budget; stops when the model stops calling tools', async () => {
    const { workDir, gameDir } = harness();
    registerProvider('fake-chat', scripted([{ toolCalls: [{ id: 'a', name: 'list_dir', input: { path: '.' } }], usage: { inputTokens: 20_000_000, outputTokens: 10 } }, { text: 'more' }]));
    const ctx = ctxFor(workDir, gameDir);
    const out = await new OpenRunner({ exec: () => ({ ok: true, out: '' }) }).run(ctx);
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('budget');
    registerProvider('fake-chat', scripted([{ text: 'I think it is done.' }]));
    const out2 = await new OpenRunner({ exec: () => ({ ok: true, out: '' }) }).run(ctx);
    expect(out2.ok).toBe(true);
    expect(out2.turns).toBe(1);
    expect(out2.summary).toBe('I think it is done.');
  });
  it('prunes old tool exchanges once the transcript exceeds the budget, keeping the task', async () => {
    const { workDir, gameDir } = harness();
    const big = 'x'.repeat(30_000);
    writeFileSync(join(gameDir, 'big.txt'), big);
    const provider = scripted([
      { toolCalls: [{ id: '1', name: 'read_file', input: { path: 'game/big.txt' } }] },
      { toolCalls: [{ id: '2', name: 'read_file', input: { path: 'game/big.txt' } }] },
      { toolCalls: [{ id: '3', name: 'read_file', input: { path: 'game/big.txt' } }] },
      { text: 'ok' },
    ]);
    registerProvider('fake-chat', provider);
    await new OpenRunner({ exec: () => ({ ok: true, out: '' }), contextCharBudget: 50_000 }).run(ctxFor(workDir, gameDir));
    const last = provider.requests[3]!.messages;
    expect(last[0]!.role).toBe('user');
    expect(last[0]!.content).toContain('Add a hook mechanic.');
    expect(last.some((m) => m.content.startsWith('(earlier steps omitted'))).toBe(true);
    expect(last.reduce((a, m) => a + m.content.length, 0)).toBeLessThan(80_000);
  });
});
