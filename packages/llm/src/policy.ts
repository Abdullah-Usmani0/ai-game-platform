import type { ModelPolicy, Stage, StagePolicy } from '@gg/schemas';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import type { Provider } from './provider.js';

const cache = new Map<string, Provider>();

/** Register a provider instance under a name (the worker registers its fake provider for dry runs). */
export function registerProvider(name: string, provider: Provider): void {
  cache.set(name, provider);
}

/** Resolve a provider by name from the environment. Providers are cached per process. */
export function providerFor(name: string): Provider {
  const cached = cache.get(name);
  if (cached) return cached;
  let p: Provider;
  if (name === 'anthropic') p = new AnthropicProvider();
  else p = OpenAICompatibleProvider.fromEnv(name);
  cache.set(name, p);
  return p;
}

export function stagePolicy(policy: ModelPolicy, stage: Stage): StagePolicy {
  const sp = policy.stages[stage];
  if (!sp) throw new Error(`policy ${policy.version} has no entry for stage '${stage}'`);
  return sp;
}
