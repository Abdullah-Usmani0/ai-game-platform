import type { ChatRequest, ChatResponse, Provider, StructuredRequest, StructuredResponse, TextRequest, TextResponse, ToolCall } from './provider.js';

interface RawChatResponse {
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

/**
 * OpenAI-compatible chat provider (vLLM, SGLang, OpenRouter, DeepSeek, MiniMax, ...).
 * Structured output uses `response_format: json_schema` with strict mode; servers that run
 * llguidance/XGrammar enforce it at decode time, others validate after the fact (we re-validate anyway).
 */
export class OpenAICompatibleProvider implements Provider {
  constructor(
    public readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  static fromEnv(name = 'openai-compatible', env: NodeJS.ProcessEnv = process.env): OpenAICompatibleProvider {
    const base = env['GG_OPENAI_BASE_URL'];
    if (!base) throw new Error('GG_OPENAI_BASE_URL is required for the openai-compatible provider');
    return new OpenAICompatibleProvider(name, base, env['GG_OPENAI_API_KEY']);
  }

  private async post(body: Record<string, unknown>): Promise<RawChatResponse> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}), ...this.extraHeaders },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${this.name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    return (await res.json()) as RawChatResponse;
  }

  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    const out = await this.post({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
    });
    const content = out.choices?.[0]?.message?.content ?? '';
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error(`${this.name}: response is not JSON: ${content.slice(0, 200)}`);
    }
    return {
      data,
      usage: { inputTokens: out.usage?.prompt_tokens ?? 0, outputTokens: out.usage?.completion_tokens ?? 0, cachedTokens: out.usage?.prompt_tokens_details?.cached_tokens ?? 0 },
      raw: out,
    };
  }

  async text(req: TextRequest): Promise<TextResponse> {
    const out = await this.post({
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    });
    return {
      text: out.choices?.[0]?.message?.content ?? '',
      usage: { inputTokens: out.usage?.prompt_tokens ?? 0, outputTokens: out.usage?.completion_tokens ?? 0, cachedTokens: out.usage?.prompt_tokens_details?.cached_tokens ?? 0 },
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const messages: Array<Record<string, unknown>> = [{ role: 'system', content: req.system }];
    for (const m of req.messages) {
      if (m.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } })) } : {}),
        });
      } else if (m.role === 'tool') messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      else messages.push({ role: 'user', content: m.content });
    }
    const out = await this.post({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.3,
      messages,
      tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      tool_choice: 'auto',
    });
    const choice = out.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c, i) => {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(c.function?.arguments || '{}') as Record<string, unknown>;
      } catch {
        input = { _raw: c.function?.arguments ?? '' };
      }
      return { id: c.id ?? `call_${i}`, name: c.function?.name ?? 'unknown', input };
    });
    const finish = choice?.finish_reason;
    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      usage: { inputTokens: out.usage?.prompt_tokens ?? 0, outputTokens: out.usage?.completion_tokens ?? 0, cachedTokens: out.usage?.prompt_tokens_details?.cached_tokens ?? 0 },
      stop: toolCalls.length > 0 || finish === 'tool_calls' ? 'tool' : finish === 'length' ? 'length' : 'end',
    };
  }
}
