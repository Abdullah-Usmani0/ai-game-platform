import { costUsd, generateArtifact, type Provider, type Usage } from '@gg/llm';
import { EditRoute, type SystemsJson } from '@gg/schemas';
import type { GenreManifest } from '@gg/template-core';
import { CATALOG } from '@gg/templates/node';
import { heuristicRoute, routeVocabulary } from './fake-provider.js';
import type { PairDraft } from './runners/types.js';

export interface RouteInputs {
  provider: Provider;
  model: string;
  message: string;
  genre: GenreManifest;
  systems: SystemsJson | null;
  levelIds: string[];
  behaviourIds: string[];
  k?: number;
}

const SYSTEM = [
  'You route an edit request for a finished 2D browser game to the cheapest route that can satisfy it.',
  'Routes: parameter (a numeric or boolean tweak of a selected system parameter; fill paramPatch with "<systemId>.<param>" keys inside the catalog ranges),',
  'style (palette, font, camera look; keys like "palette.accent"), behaviour (how an enemy type acts), content (level layout or difficulty of named levels),',
  'code (a new mechanic or anything you are not sure about). Set confidence honestly; under 0.7 the platform uses the code route.',
].join('\n');

/**
 * One structured call (routing tier). Falls back to keyword routing when the model fails; low confidence becomes code.
 * `pair` is the model's route when it was used as given (not a fallback, not overridden for low confidence).
 */
export async function routeEdit(inp: RouteInputs): Promise<{ route: EditRoute; usage: Usage; costUsd: number; promptHash?: string; pair?: PairDraft }> {
  const catalog = inp.systems?.systems.map((s) => {
    const c = CATALOG[s.id];
    return { id: s.id, params: Object.fromEntries(Object.entries(c?.params ?? {}).map(([k, p]) => [k, { current: s.params[k] ?? p.default, min: p.min, max: p.max, type: p.type }])) };
  });
  const prompt = [
    `Message: ${inp.message.replace(/\n/g, ' ')}`,
    '',
    `Genre: ${inp.genre.id}. Levels: ${inp.levelIds.join(', ') || '(none)'}. Behaviours: ${inp.behaviourIds.join(', ') || '(none)'}.`,
    `Selected systems and parameters: ${JSON.stringify(catalog ?? [])}`,
    'Style keys: palette.{background,mid,foreground,accent,danger,ui} (hex), camera.{lerp,maxShake,zoom}, typography.{font,size}.',
  ].join('\n');
  const res = await generateArtifact<EditRoute>({
    provider: inp.provider,
    model: inp.model,
    artifact: 'EditRoute',
    system: SYSTEM,
    prompt,
    k: inp.k ?? 1,
    repairRounds: 1,
    verify: (r) => {
      const issues: string[] = [];
      for (const p of r.paramPatch) {
        if (r.route === 'style') continue;
        const [sys, param] = p.key.split('.');
        const c = sys ? CATALOG[sys] : undefined;
        const spec = c && param ? c.params[param] : undefined;
        if (!spec) issues.push(`paramPatch key '${p.key}' is not a catalog parameter`);
        else if (spec.type === 'number' && typeof p.value === 'number' && ((spec.min !== undefined && p.value < spec.min) || (spec.max !== undefined && p.value > spec.max))) issues.push(`${p.key}=${p.value} outside [${spec.min}, ${spec.max}]`);
        else if (inp.systems && !inp.systems.systems.some((s) => s.id === sys)) issues.push(`system '${sys}' is not selected in this game`);
      }
      if (r.route === 'parameter' && r.paramPatch.length === 0) issues.push('parameter route needs a non-empty paramPatch');
      return issues;
    },
  });
  const usage = res.samples.reduce<Usage>((a, s) => ({ inputTokens: a.inputTokens + s.usage.inputTokens, outputTokens: a.outputTokens + s.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 });
  const selected = res.selected?.value;
  let route = selected ?? heuristicRoute(inp.message, routeVocabulary(inp.genre, inp.behaviourIds));
  const lowConfidence = route.confidence < 0.7 && route.route !== 'code';
  if (lowConfidence) route = { ...route, route: 'code', designNotes: `${route.designNotes} (confidence ${route.confidence} < 0.7, code route)` };
  const pair = selected && !lowConfidence ? { artifact: 'EditRoute', system: SYSTEM, prompt, output: selected } : undefined;
  return { route: EditRoute.parse(route), usage, costUsd: res.totalCostUsd || costUsd(inp.model, usage), promptHash: res.selected?.promptHash, pair };
}
