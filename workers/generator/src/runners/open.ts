import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { costUsd, promptHash, providerFor, type ChatMessage, type ToolCall, type ToolSpec, type Usage } from '@gg/llm';
import { bashDecision, readDecision, writeDecision } from '../guards.js';
import type { Runner, StageContext, StageOutcome } from './types.js';

export type Exec = (command: string, cwd: string) => { ok: boolean; out: string };

export interface OpenRunnerOptions {
  /** Command execution (tests inject a fake). */
  exec?: Exec;
  /** Max characters of conversation kept before the oldest tool exchanges are dropped. */
  contextCharBudget?: number;
}

const TOOLS: ToolSpec[] = [
  { name: 'read_file', description: 'Read a text file (relative path from the harness root, e.g. game/design/gdd.md). Large files are truncated.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'write_file', description: 'Create or overwrite a text file inside the stage write scope. JSON under game/content or game/design is validated on write.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'list_dir', description: 'List a directory (relative path).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'bash', description: 'Run ONE allowed command: pnpm gate, pnpm validate <file>, pnpm -C game typecheck|lint|test|build, pnpm exec gg-bots ..., pnpm catalog <genre>, node --import tsx .agents/skills/<skill>/scripts/<script>.ts ..., or ls/cat/grep/head/tail/wc/find/diff.', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false } },
  { name: 'finish', description: 'Stop when the gate passes (or you are blocked): a summary of what you did, the commands you ran and the report paths, at most ten lines.', inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false } },
];

const MAX_READ = 48_000;
const MAX_TOOL_OUT = 6_000;

function tail(text: string, max = MAX_TOOL_OUT): string {
  return text.length <= max ? text : `...(${text.length - max} chars omitted)\n${text.slice(-max)}`;
}

const defaultExec: Exec = (command, cwd) => {
  const r = spawnSync('bash', ['-c', command], { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

function readIfExists(p: string, max = 20_000): string {
  return existsSync(p) ? readFileSync(p, 'utf8').slice(0, max) : '';
}

/** What the Claude runner gets from the SessionStart hook, rebuilt as a system prompt: AGENTS.md, the stage, the skills, the playbook. */
export function buildSystemPrompt(ctx: StageContext): string {
  const parts: string[] = [];
  parts.push(readIfExists(join(ctx.workDir, 'AGENTS.md')));
  let stage: Record<string, unknown>;
  try {
    stage = JSON.parse(readFileSync(join(ctx.workDir, 'stage.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    stage = {};
  }
  parts.push(`## Stage: ${ctx.spec.stage} (attempt ${ctx.attempt})\nGate: ${(ctx.spec.gate ?? []).join(', ')}\nWrite scope: ${(ctx.spec.allowedWrite ?? []).join(', ') || '(none)'}\nModel: ${ctx.model} (open runner)${stage['task'] ? `\nTask: ${String(stage['task'])}` : ''}`);
  for (const skill of ctx.spec.skills ?? []) {
    const md = readIfExists(join(ctx.workDir, '.agents', 'skills', skill, 'SKILL.md'), 8_000);
    if (md) parts.push(`## Skill: ${skill}\n${md}`);
  }
  const gddPath = join(ctx.gameDir, 'design', 'gdd.md');
  if (existsSync(gddPath)) {
    const fm = readFileSync(gddPath, 'utf8').split('\n').slice(0, 3).join('\n');
    parts.push(`## GDD front matter\n${fm.slice(0, 3_000)}`);
  }
  let genre = ctx.request?.genre ?? '';
  try {
    genre = genre || (JSON.parse(readFileSync(join(ctx.gameDir, 'design', 'systems.json'), 'utf8')) as { genre?: string }).genre || '';
  } catch {
    /* no systems.json yet */
  }
  const playbook = genre ? readIfExists(join(ctx.workDir, '.agents', 'skills', 'playbook', 'entries', `${genre}.md`), 4_000) : '';
  if (playbook) parts.push(`## Playbook (${genre})\n${playbook}`);
  const lastGate = existsSync(join(ctx.gameDir, 'reports')) ? readdirSync(join(ctx.gameDir, 'reports')).filter((f) => f.startsWith('gate-')).sort().pop() : undefined;
  if (lastGate) {
    try {
      const r = JSON.parse(readFileSync(join(ctx.gameDir, 'reports', lastGate), 'utf8')) as { passed: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };
      parts.push(`## Last gate (${lastGate}): passed=${r.passed}\n${r.checks.filter((c) => !c.passed).map((c) => `- FAIL ${c.name}: ${c.detail.slice(0, 400)}`).join('\n')}`);
    } catch {
      /* ignore */
    }
  }
  parts.push('## Tools\nUse read_file, write_file, list_dir and bash; prefer the bundled scripts over reasoning. Run `pnpm gate` before you finish; call finish only when it passes or you are blocked. Keep every file edit inside the write scope.');
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Built-in agent loop for open-weight and OpenAI-compatible models: the same AGENTS.md, skills, playbook and
 * guards as the Claude runner, a small tool set, scrubbed context, and the worker's gate as the only judge.
 */
export class OpenRunner implements Runner {
  readonly kind = 'open' as const;
  private readonly exec: Exec;
  private readonly contextCharBudget: number;

  constructor(opts: OpenRunnerOptions = {}) {
    this.exec = opts.exec ?? defaultExec;
    this.contextCharBudget = opts.contextCharBudget ?? 160_000;
  }

  private tool(ctx: StageContext, call: ToolCall): string {
    const input = call.input;
    const rel = (p: unknown): string => String(p ?? '').replace(/^\.\//, '');
    switch (call.name) {
      case 'read_file': {
        const r = rel(input['path']);
        const d = readDecision(r);
        if (!d.ok) return `Blocked: ${d.reason}`;
        const abs = resolve(ctx.workDir, r);
        if (!abs.startsWith(resolve(ctx.workDir))) return 'Blocked: path escapes the harness directory';
        if (!existsSync(abs)) return `No such file: ${r}`;
        if (statSync(abs).isDirectory()) return `${r} is a directory; use list_dir`;
        const text = readFileSync(abs, 'utf8');
        return text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n...(truncated, ${text.length} chars)` : text;
      }
      case 'list_dir': {
        const r = rel(input['path']) || '.';
        const d = readDecision(r);
        if (!d.ok) return `Blocked: ${d.reason}`;
        const abs = resolve(ctx.workDir, r);
        if (!abs.startsWith(resolve(ctx.workDir)) || !existsSync(abs)) return `No such directory: ${r}`;
        return readdirSync(abs)
          .filter((n) => n !== 'node_modules')
          .map((n) => (statSync(join(abs, n)).isDirectory() ? `${n}/` : n))
          .join('\n');
      }
      case 'write_file': {
        const r = rel(input['path']);
        const d = writeDecision(r, ctx.spec.allowedWrite ?? []);
        if (!d.ok) return `Blocked: ${d.reason}`;
        const abs = resolve(ctx.workDir, r);
        if (!abs.startsWith(resolve(ctx.workDir))) return 'Blocked: path escapes the harness directory';
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, String(input['content'] ?? ''));
        let note = `Wrote ${r} (${String(input['content'] ?? '').length} chars).`;
        if (/^game\/(content|design)\/.*\.(json|md)$/.test(r)) {
          const v = this.exec(`pnpm validate ${r}`, ctx.workDir);
          note += `\nValidation: ${v.ok ? 'OK' : 'FAILED'}\n${tail(v.out, 2_000)}`;
        }
        return note;
      }
      case 'bash': {
        const cmd = String(input['command'] ?? '');
        const d = bashDecision(cmd);
        if (!d.ok) return `Blocked: ${d.reason}`;
        const r = this.exec(cmd, ctx.workDir);
        return `exit ${r.ok ? 0 : 'non-zero'}\n${tail(r.out)}`;
      }
      default:
        return `Unknown tool '${call.name}'`;
    }
  }

  async run(ctx: StageContext): Promise<StageOutcome> {
    const t0 = Date.now();
    const provider = providerFor(ctx.provider);
    if (!provider.chat) return { ok: false, summary: `provider '${ctx.provider}' has no tool-calling chat; use the structured runner for this stage`, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, durationMs: 0, turns: 0, failureMode: 'api_misuse' };
    const caps = ctx.policy?.caps ?? { turns: 40, usd: 2, wallMin: 20 };
    const system = buildSystemPrompt(ctx);
    const task = ctx.spec.task ?? `Complete the '${ctx.spec.stage}' stage for this game.`;
    const messages: ChatMessage[] = [{ role: 'user', content: `${task}\n\nWork only inside the write scope. Finish by running \`pnpm gate\`; it must pass before you call finish.` }];
    let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let cost = 0;
    let turns = 0;
    let summary = '';
    let failureMode: StageOutcome['failureMode'] | undefined;
    const deadline = t0 + (caps.wallMin || 20) * 60_000;
    for (let round = 0; round < Math.max(1, caps.turns || 40); round++) {
      if (Date.now() > deadline) {
        failureMode = 'budget';
        summary = summary || 'wall-clock cap reached';
        break;
      }
      let res;
      try {
        res = await provider.chat({ model: ctx.model, system, messages, tools: TOOLS, maxTokens: 4096 });
      } catch (e) {
        return { ok: false, summary: `provider error: ${(e as Error).message}`, usage, costUsd: cost, durationMs: Date.now() - t0, turns, failureMode: 'infra', promptHash: promptHash(system, task, ctx.spec.stage) };
      }
      turns++;
      usage = { inputTokens: usage.inputTokens + res.usage.inputTokens, outputTokens: usage.outputTokens + res.usage.outputTokens, cachedTokens: (usage.cachedTokens ?? 0) + (res.usage.cachedTokens ?? 0) };
      cost += costUsd(ctx.model, res.usage);
      messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
      if (res.text.trim()) summary = res.text.trim().slice(-2_000);
      if (res.toolCalls.length === 0) break; // the model stopped talking; the worker's gate decides
      let finished = false;
      for (const call of res.toolCalls) {
        if (call.name === 'finish') {
          summary = String(call.input['summary'] ?? summary).slice(0, 2_000);
          finished = true;
          messages.push({ role: 'tool', toolCallId: call.id, content: 'ok' });
          continue;
        }
        const out = this.tool(ctx, call);
        ctx.log(`open: ${call.name} ${String(call.input['path'] ?? call.input['command'] ?? '').slice(0, 80)} -> ${out.split('\n')[0]?.slice(0, 80)}`);
        messages.push({ role: 'tool', toolCallId: call.id, content: out });
      }
      if (finished) break;
      if (cost >= caps.usd && caps.usd > 0) {
        failureMode = 'budget';
        summary = `${summary}\n(usd cap ${caps.usd} reached)`.trim();
        break;
      }
      this.prune(messages);
    }
    if (!summary) summary = 'session ended without a summary';
    return { ok: failureMode === undefined, summary, usage, costUsd: cost, durationMs: Date.now() - t0, turns, failureMode, promptHash: promptHash(system, task, ctx.spec.stage) };
  }

  /** Context hygiene: drop the oldest assistant/tool exchanges (never the task) once the transcript grows past the budget. */
  private prune(messages: ChatMessage[]): void {
    const size = () => messages.reduce((a, m) => a + m.content.length + JSON.stringify(m.toolCalls ?? []).length, 0);
    while (size() > this.contextCharBudget && messages.length > 5) {
      // messages[0] is the task; remove the oldest assistant turn and its tool results.
      const idx = messages.findIndex((m, i) => i > 0 && m.role === 'assistant');
      if (idx < 0) break;
      let end = idx + 1;
      while (end < messages.length && messages[end]!.role === 'tool') end++;
      messages.splice(idx, end - idx, { role: 'user', content: '(earlier steps omitted to keep the context small; re-read files you need)' });
      // Merge consecutive user notes.
      for (let i = messages.length - 1; i > 0; i--) if (messages[i]!.content.startsWith('(earlier steps') && messages[i - 1]!.content.startsWith('(earlier steps')) messages.splice(i, 1);
    }
  }
}

