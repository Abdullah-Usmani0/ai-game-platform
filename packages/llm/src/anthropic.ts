import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResponse, Provider, StructuredRequest, StructuredResponse, TextRequest, TextResponse, ToolCall } from './provider.js';

/**
 * Anthropic provider. Structured output uses a single strict tool with the artifact's JSON Schema as
 * input_schema and forces the call, which constrains decoding to the schema on current Claude models.
 * The system prompt is marked cacheable so the stable prefix (rules, catalog, style card) hits the prompt cache.
 */
export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey = process.env['ANTHROPIC_API_KEY']) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for the anthropic provider');
    this.client = new Anthropic({ apiKey });
  }

  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.prompt }],
      tools: [
        {
          name: req.schemaName,
          description: `Return the ${req.schemaName} artifact.`,
          input_schema: req.schema as Anthropic.Tool['input_schema'],
          strict: true,
        } as Anthropic.Tool,
      ],
      tool_choice: { type: 'tool', name: req.schemaName },
    });
    const toolUse = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    if (!toolUse) throw new Error(`anthropic: no tool_use block in response (stop_reason=${res.stop_reason})`);
    return {
      data: toolUse.input,
      usage: {
        inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
        outputTokens: res.usage.output_tokens,
        cachedTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
      raw: res,
    };
  }

  async text(req: TextRequest): Promise<TextResponse> {
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.prompt }],
    });
    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
        outputTokens: res.usage.output_tokens,
        cachedTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Consecutive tool results merge into one user message (the API alternates user/assistant turns).
    const messages: Anthropic.MessageParam[] = [];
    for (const m of req.messages) {
      if (m.role === 'assistant') {
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const t of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
        messages.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '(no content)' }] });
      } else if (m.role === 'tool') {
        const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content };
        const last = messages[messages.length - 1];
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) (last.content as Anthropic.ToolResultBlockParam[]).push(block);
        else messages.push({ role: 'user', content: [block] });
      } else messages.push({ role: 'user', content: m.content });
    }
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages,
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool['input_schema'] })),
    });
    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');
    const toolCalls: ToolCall[] = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, input: (c.input ?? {}) as Record<string, unknown> }));
    return {
      text,
      toolCalls,
      usage: {
        inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
        outputTokens: res.usage.output_tokens,
        cachedTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      },
      stop: res.stop_reason === 'tool_use' ? 'tool' : res.stop_reason === 'max_tokens' ? 'length' : 'end',
    };
  }
}
