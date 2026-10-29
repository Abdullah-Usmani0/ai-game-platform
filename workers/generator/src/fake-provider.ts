import type { Provider, StructuredRequest, StructuredResponse, TextRequest, TextResponse } from '@gg/llm';
import type { CreateRequest, EditRoute } from '@gg/schemas';
import { defaultSystems } from '@gg/scaffold';
import type { GenreManifest } from '@gg/template-core';
import { draftBody, draftFrontmatter } from './gdd-draft.js';

const ZERO = { inputTokens: 0, outputTokens: 0 };
const STYLE_KEYS = /^(palette|camera|typography|postFx|animationFps|canvas)\.|^(outline|family|pixelArt)$/;

/** Which behaviour an edit about an enemy means: the game's behaviour ids, and the entity types that run each one. */
export interface RouteVocabulary {
  behaviours: readonly string[];
  /** Enemy type to the behaviour (FSM id) it runs; several may share one (a survivors brute runs the chaser). Items are left out. */
  types: Readonly<Record<string, string>>;
}

/** A game's routing vocabulary: its genre's entity types and the behaviours it ships (the genre's defaults when unknown). */
export function routeVocabulary(g: Pick<GenreManifest, 'entityDefs' | 'defaultBehaviours'>, behaviourIds: readonly string[] = []): RouteVocabulary {
  const behaviours = behaviourIds.length ? [...behaviourIds] : g.defaultBehaviours.map((b) => b.id);
  // Pickups drift and bob too, but an edit naming one ('more power') is not about enemy behaviour.
  const types = Object.fromEntries(g.entityDefs.filter((e) => e.fsm && !e.pickup && behaviours.includes(e.fsm)).map((e) => [e.type, e.fsm!]));
  return { behaviours, types };
}

/** The behaviour a message names, by entity type or behaviour id, singular or plural ("the brutes", "the archer's"). */
function namedBehaviour(m: string, vocab: RouteVocabulary): string | undefined {
  for (const word of m.match(/[a-z][a-z0-9-]*/g) ?? []) {
    for (const w of [word, word.replace(/es$/, ''), word.replace(/s$/, '')]) {
      const hit = vocab.types[w] ?? (vocab.behaviours.includes(w) ? w : undefined);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Keyword routing for edit messages: used by the fake provider and as the fallback when the router model fails.
 * Explicit `set <system>.<param>=<value>` phrases become a parameter (or style) patch; an enemy the game has, named by
 * type or behaviour, routes to its behaviour; everything else is a low-confidence code route, the safe default.
 */
export function heuristicRoute(message: string, vocab: RouteVocabulary): EditRoute {
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
  const enemy = namedBehaviour(m, vocab);
  if (enemy || /\b(enemy|enemies|behaviou?r|chase|patrol|ai)\b/.test(m)) return { designNotes: 'enemy wording', route: 'behaviour', targets: enemy ? [enemy] : [], affectedScenes: ['gameplay'], confidence: 0.75, paramPatch: [] };
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
    if (this.ctx.request) return this.ctx.request;
    const genre = this.ctx.genre.id;
    if (genre === 'freeform') throw new Error('the fake provider drafts a freeform game only from its create request');
    return { prompt: `A ${this.ctx.genre.name.toLowerCase()} made by the dry run.`, genre, scopeTier: 'small', referenceTitles: [], dryRun: true };
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
      case 'EditRoute': {
        // The router's prompt lists the game's behaviours ("Behaviours: grunt, brute.").
        const listed = (marker(/^Genre: .*Behaviours: ([^.]*)\./m) ?? '').split(', ').filter((b) => b && b !== '(none)');
        data = heuristicRoute(marker(/^Message: (.+)$/m) ?? '', routeVocabulary(g, listed));
        break;
      }
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
