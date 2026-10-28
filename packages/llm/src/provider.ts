import type { Usage } from './pricing.js';

export interface StructuredRequest {
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema (draft 2020-12) the output must satisfy; flat and non-recursive by convention. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
}

export interface StructuredResponse {
  /** Parsed JSON object as returned by the provider, before zod validation. */
  data: unknown;
  usage: Usage;
  raw?: unknown;
}

export interface TextRequest {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TextResponse {
  text: string;
  usage: Usage;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool input (flat objects only). */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Assistant messages: the tool calls it made. */
  toolCalls?: ToolCall[];
  /** Tool messages: which call this result answers. */
  toolCallId?: string;
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stop: 'end' | 'tool' | 'length';
}

/** A model provider: Anthropic Messages or any OpenAI-compatible endpoint (vLLM, OpenRouter, DeepSeek, ...). */
export interface Provider {
  readonly name: string;
  structured(req: StructuredRequest): Promise<StructuredResponse>;
  text(req: TextRequest): Promise<TextResponse>;
  /** One tool-using chat turn (the built-in open runner's loop). Optional: not every provider supports tools. */
  chat?(req: ChatRequest): Promise<ChatResponse>;
}
