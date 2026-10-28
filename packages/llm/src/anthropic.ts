import Anthropic from '@anthropic-ai/sdk';
import type { Provider, StructuredRequest, StructuredResponse, TextRequest, TextResponse } from './provider.js';

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
}
