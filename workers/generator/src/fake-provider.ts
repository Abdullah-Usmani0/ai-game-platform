import type { Provider, StructuredRequest, StructuredResponse, TextRequest, TextResponse } from '@gg/llm';
import type { CreateRequest, EditRoute } from '@gg/schemas';
import { defaultSystems } from '@gg/scaffold';
import type { GenreManifest } from '@gg/template-core';
import { draftBody, draftFrontmatter } from './gdd-draft.js';

const ZERO = { inputTokens: 0, outputTokens: 0 };
const STYLE_KEYS = /^(palette|camera|typography|postFx|animationFps|canvas)\.|^(outline|family|pixelArt)$/;

/**
 * Keyword routing for edit messages: used by the fake provider and as the fallback when the router model fails.
 * Explicit `set <system>.<param>=<value>` phrases become a parameter (or style) patch; everything else is a
 * low-confidence code route, which is the safe default.
 */
export function heuristicRoute(message: string): EditRoute {
  const m = message.toLowerCase();
  const patch: EditRoute['paramPatch'] = [];
  const re = /([a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9]+)+)\s*=\s*(#[0-9a-fA-F]{6}|-?\d+(?:\.\d+)?|true|false|"[^"]*")/g;
  for (const hit of message.matchAll(re)) {
    const raw = hit[2]!;
    const value = raw === 'true' ? true : raw === 'false' ? false : /^-?\d/.test(raw) ? Number(raw) : raw.replace(/^"|"$/g, '');
    patch.push({ key: hit[1]!, value });
  }
  if (patch.length && patch.every((p) => STYLE_KEYS.test(p.key))) return { designNotes: 'explicit style assignments', route: 'style', targets: patch.map((p) => p.key), affectedScenes: ['all'], confidence: 0.9, paramPatch: patch };
  if (patch.length) return { designNotes: 'explicit parameter assignments', route: 'parameter', targets: patch.map((p) => p.key.split('.')[0]!), affectedScenes: ['gameplay'], confidence: 0.9, paramPatch: patch };
  if (/\b(colou?r|palette|style|look|font|theme|shake)\b/.test(m)) return { designNotes: 'visual wording', route: 'style', targets: [], affectedScenes: ['all'], confidence: 0.75, paramPatch: [] };
  const enemy = /\b(walker|hopper|turret|chaser|brute)\b/.exec(m)?.[1];
  if (enemy || /\b(enemy|enemies|behaviou?r|chase|patrol|ai)\b/.test(m)) return { designNotes: 'enemy wording', route: 'behaviour', targets: enemy ? [enemy === 'brute' ? 'chaser' : enemy] : [], affectedScenes: ['gameplay'], confidence: 0.75, paramPatch: [] };
  const level = /\b(?:level|l)\s?0?(\d+)\b/.exec(m)?.[1];
  if (level || /\b(level|layout|map|arena|stage|room|pit|gap|platform)\b/.test(m)) return { designNotes: 'level wording', route: 'content', targets: level ? [`l${level.padStart(2, '0')}`] : [], affectedScenes: ['gameplay'], confidence: 0.75, paramPatch: [] };
  return { designNotes: 'no confident match; code route', route: 'code', targets: [], affectedScenes: ['gameplay'], confidence: 0.5, paramPatch: [] };
}

/**
 * A provider that answers every structured request with a verified exemplar for the genre, and every text
 * request with the drafted GDD body. Zero cost, deterministic: the pipeline runs end to end in CI without keys.
 */
export class FakeProvider implements Provider {
  readonly name = 'fake';

  constructor(private readonly ctx: { genre: GenreManifest; request: CreateRequest | null }) {}

  private request(): CreateRequest {
    return this.ctx.request ?? { prompt: `A ${this.ctx.genre.name.toLowerCase()} made by the dry run.`, genre: this.ctx.genre.id, scopeTier: 'small', referenceTitles: [], dryRun: true };
  }

  async structured(req: StructuredRequest): Promise<StructuredResponse> {
    const g = this.ctx.genre;
    const marker = (re: RegExp) => re.exec(req.prompt)?.[1];
    let data: unknown;
    switch (req.schemaName) {
      case 'GddFrontmatter':
        data = draftFrontmatter(this.request(), g);
        break;
      case 'SystemsJson':
        data = g.exemplars.find((e) => e.kind === 'systems')?.artifact ?? defaultSystems(g.id, g.optionalSystems);
        break;
      case 'BehaviourFsm': {
        const id = marker(/^Behaviour id: (\S+)/m);
        data = g.defaultBehaviours.find((b) => b.id === id) ?? g.exemplars.find((e) => e.kind === 'behaviour')?.artifact;
        break;
      }
      case 'EditRoute':
        data = heuristicRoute(marker(/^Message: (.+)$/m) ?? '');
        break;
      default:
        throw new Error(`fake provider has no exemplar for ${req.schemaName}`);
    }
    return { data, usage: { ...ZERO } };
  }

  async text(req: TextRequest): Promise<TextResponse> {
    if (/GDD body/.test(req.prompt)) {
      const r = this.request();
      return { text: draftBody(r, this.ctx.genre, draftFrontmatter(r, this.ctx.genre)), usage: { ...ZERO } };
    }
    return { text: 'NO FINDINGS', usage: { ...ZERO } };
  }
}
