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

/** A model provider: Anthropic Messages or any OpenAI-compatible endpoint (vLLM, OpenRouter, DeepSeek, ...). */
export interface Provider {
  readonly name: string;
  structured(req: StructuredRequest): Promise<StructuredResponse>;
  text(req: TextRequest): Promise<TextResponse>;
}
