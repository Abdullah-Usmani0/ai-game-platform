/** USD per million tokens. Keep in sync with provider pricing pages; open-model rows are hosted-provider list prices. */
export interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'deepseek-v4-flash': { input: 0.09, output: 0.18 },
  'minimax-m2.5': { input: 0.15, output: 1.2 },
  'qwen3.6-27b': { input: 0.1, output: 0.3 },
  'gpt-oss-120b': { input: 0.037, output: 0.17 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

export function costUsd(model: string, usage: Usage): number {
  const p = PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, '')];
  if (!p) return 0;
  const cached = usage.cachedTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached - written);
  const usd = (fresh * p.input + cached * (p.cacheRead ?? p.input) + written * (p.cacheWrite ?? p.input) + usage.outputTokens * p.output) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}
