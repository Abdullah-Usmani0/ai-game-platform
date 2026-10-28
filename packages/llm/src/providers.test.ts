import { afterEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: createMock };
    constructor(_opts: unknown) {}
  },
}));

import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';

afterEach(() => {
  createMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AnthropicProvider (mocked SDK)', () => {
  it('forces one strict tool, caches the system prompt and maps usage including cache fields', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 't1', name: 'BehaviourFsm', input: { version: 1, id: 'x' } }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 },
      stop_reason: 'tool_use',
    });
    const p = new AnthropicProvider('sk-test');
    const res = await p.structured({ model: 'claude-haiku-5-5', system: 'rules', prompt: 'make it', schema: { type: 'object' }, schemaName: 'BehaviourFsm' });
    expect(res.data).toEqual({ version: 1, id: 'x' });
    expect(res.usage).toEqual({ inputTokens: 130, outputTokens: 5, cachedTokens: 100, cacheWriteTokens: 20 });
    const args = createMock.mock.calls[0]![0] as { tools: Array<{ name: string; strict: boolean }>; tool_choice: { type: string; name: string }; system: Array<{ cache_control: { type: string } }>; model: string };
    expect(args.model).toBe('claude-haiku-5-5');
    expect(args.tools[0]).toMatchObject({ name: 'BehaviourFsm', strict: true });
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'BehaviourFsm' });
    expect(args.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });
  it('throws when the model answers without the tool call', async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'sorry' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
    const p = new AnthropicProvider('sk-test');
    await expect(p.structured({ model: 'm', system: 's', prompt: 'p', schema: {}, schemaName: 'X' })).rejects.toThrow(/no tool_use/);
  });
  it('joins text blocks for text calls', async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }], usage: { input_tokens: 3, output_tokens: 2 }, stop_reason: 'end_turn' });
    const p = new AnthropicProvider('sk-test');
    const res = await p.text({ model: 'm', system: 's', prompt: 'p' });
    expect(res.text).toBe('hello world');
    expect(res.usage.inputTokens).toBe(3);
  });
  it('requires an API key', () => {
    expect(() => new AnthropicProvider(undefined)).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('OpenAICompatibleProvider (stubbed fetch)', () => {
  it('sends a strict json_schema response_format and parses the JSON content', async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ ok: true, body: JSON.parse(init.body).response_format.json_schema.name }) } }], usage: { prompt_tokens: 50, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 30 } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenAICompatibleProvider('vllm', 'http://localhost:8000/v1/', 'key');
    const res = await p.structured({ model: 'qwen3.6-27b', system: 's', prompt: 'p', schema: { type: 'object' }, schemaName: 'WaveTable' });
    expect(res.data).toEqual({ ok: true, body: 'WaveTable' });
    expect(res.usage).toEqual({ inputTokens: 50, outputTokens: 20, cachedTokens: 30 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://localhost:8000/v1/chat/completions');
    expect(init.headers['authorization']).toBe('Bearer key');
    const body = JSON.parse(init.body) as { response_format: { type: string; json_schema: { strict: boolean } }; messages: Array<{ role: string }> };
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
  });
  it('fails loudly on non-JSON content and on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) })));
    const p = new OpenAICompatibleProvider('x', 'http://h', undefined);
    await expect(p.structured({ model: 'm', system: 's', prompt: 'p', schema: {}, schemaName: 'X' })).rejects.toThrow(/not JSON/);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'overloaded' })));
    await expect(p.text({ model: 'm', system: 's', prompt: 'p' })).rejects.toThrow(/HTTP 503/);
  });
  it('needs a base URL from the environment', () => {
    expect(() => OpenAICompatibleProvider.fromEnv('deepseek', {})).toThrow(/GG_OPENAI_BASE_URL/);
    expect(OpenAICompatibleProvider.fromEnv('deepseek', { GG_OPENAI_BASE_URL: 'http://x' }).name).toBe('deepseek');
  });
});

describe('tool-calling chat', () => {
  it('Anthropic: merges consecutive tool results into one user turn and parses tool_use blocks', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Reading.' }, { type: 'tool_use', id: 'tu1', name: 'read_file', input: { path: 'AGENTS.md' } }],
      usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      stop_reason: 'tool_use',
    });
    const p = new AnthropicProvider('sk-test');
    const res = await p.chat!({
      model: 'claude-haiku-5-5',
      system: 'sys',
      messages: [
        { role: 'user', content: 'task' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'list_dir', input: { path: '.' } }, { id: 'b', name: 'read_file', input: { path: 'x' } }] },
        { role: 'tool', toolCallId: 'a', content: 'game/' },
        { role: 'tool', toolCallId: 'b', content: 'hello' },
      ],
      tools: [{ name: 'read_file', description: 'd', inputSchema: { type: 'object' } }],
    });
    expect(res.toolCalls).toEqual([{ id: 'tu1', name: 'read_file', input: { path: 'AGENTS.md' } }]);
    expect(res.text).toBe('Reading.');
    expect(res.stop).toBe('tool');
    const args = createMock.mock.calls[0]![0] as { messages: Array<{ role: string; content: unknown }>; tools: Array<{ name: string }> };
    expect(args.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect((args.messages[2]!.content as Array<{ type: string }>).map((b) => b.type)).toEqual(['tool_result', 'tool_result']);
    expect(args.tools[0]!.name).toBe('read_file');
  });
  it('OpenAI-compatible: sends function tools and parses tool_calls, tolerating bad JSON arguments', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'bash', arguments: '{"command":"pnpm gate"}' } }, { id: 'c2', function: { name: 'finish', arguments: 'not json' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenAICompatibleProvider('vllm', 'http://localhost:8000/v1', undefined);
    const res = await p.chat!({ model: 'm', system: 's', messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'ok', toolCalls: [{ id: 'z', name: 'list_dir', input: {} }] }, { role: 'tool', toolCallId: 'z', content: 'game/' }], tools: [{ name: 'bash', description: 'd', inputSchema: { type: 'object' } }] });
    expect(res.stop).toBe('tool');
    expect(res.toolCalls[0]).toEqual({ id: 'c1', name: 'bash', input: { command: 'pnpm gate' } });
    expect(res.toolCalls[1]!.input).toEqual({ _raw: 'not json' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { tools: Array<{ type: string; function: { name: string } }>; messages: Array<{ role: string; tool_call_id?: string }> };
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'bash' } });
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(body.messages[3]!.tool_call_id).toBe('z');
  });
});
