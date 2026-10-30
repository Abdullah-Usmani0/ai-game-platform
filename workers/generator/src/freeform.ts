import { CURATED_GENRES, FreeformGddFrontmatter, type CreateRequest, type CuratedGenre, type EntityRoster, type FreeformSystemsJson, type Objectives } from '@gg/schemas';
import { grammarHasGoal, systemsJsonFor } from '@gg/template-core';
import { BASE_MANIFESTS, EXAMPLES, IDENTITY_ROSTER, type FreeformExample } from '@gg/template-freeform/node';
import { draftFrontmatter } from './gdd-draft.js';

/** Words that point at a base genre: what its levels and verbs are made of. */
const BASE_WORDS: Record<CuratedGenre, RegExp> = {
  platformer: /\b(jump\w*|platform\w*|ledge\w*|side-?scroll\w*|climb\w*|forest|lanterns?|moth)\b/g,
  survivors: /\b(surviv\w*|swarm\w*|hordes?|waves?|hold(ing)? out|until dawn|arena|hive|bees?)\b/g,
  'topdown-action': /\b(rooms?|dungeon\w*|vaults?|swords?|blades?|clear\w*|top-?down|guards?|burglar|heist)\b/g,
  metroidvania: /\b(explor\w*|abilit\w*|keys?|doors?|unlock\w*|backtrack\w*|caves?|relics?)\b/g,
  shmup: /\b(ships?|space\w*|shoot\w*|bullets?|lasers?|pilots?|starfighter\w*)\b/g,
  puzzle: /\b(puzzl\w*|push\w*|crates?|box(es)?|sokoban|blocks?|slid\w*)\b/g,
  lifesim: /\b(farm\w*|crops?|harvest\w*|seeds?|sow\w*|garden\w*|orchard\w*|ranch\w*|cozy|cosy|villag\w*|homestead\w*)\b/g,
};

/** The base genre a freeform idea reads closest to, from its words: the dry run's choice and the fallback's. */
export function guessBase(prompt: string): CuratedGenre {
  const text = prompt.toLowerCase();
  let best: CuratedGenre = 'topdown-action';
  let score = 0;
  for (const g of CURATED_GENRES) {
    const n = text.match(BASE_WORDS[g])?.length ?? 0;
    if (n > score) {
      best = g;
      score = n;
    }
  }
  return best;
}

/** The hand-made example on a base, the one sharing most words with the idea; null when none builds on that base. */
export function exampleFor(base: CuratedGenre, prompt = ''): FreeformExample | null {
  const words = new Set(prompt.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const shared = (ex: FreeformExample) => (ex.prompt.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length;
  return EXAMPLES.filter((ex) => ex.systems.composition.base === base).sort((a, b) => shared(b) - shared(a))[0] ?? null;
}

/** A freeform GDD front matter drafted on a base: the base genre's defaults, the idea's title. */
export function draftFreeformFrontmatter(req: CreateRequest, base: CuratedGenre): FreeformGddFrontmatter {
  const fm = draftFrontmatter({ ...req, genre: base }, BASE_MANIFESTS[base]);
  return FreeformGddFrontmatter.parse({ ...fm, genre: 'freeform', base });
}

/** The base genre's own systems as a freeform game's: the fallback when no composition is accepted. */
export function baseSystems(base: CuratedGenre): FreeformSystemsJson {
  return { ...systemsJsonFor(BASE_MANIFESTS[base]), genre: 'freeform', composition: { base } };
}

/** The roster when none is accepted: the base genre's entities under their own names. */
export const BASE_ROSTER: EntityRoster = IDENTITY_ROSTER;

/**
 * Objectives for a freeform game when none are accepted: on a farm, which nothing hurts, a season's purse before time
 * runs out; on an arena base, which has no goal tile, hold out for the level time; else reach the goal. Arenas and
 * goals come with lives, so dying always costs something.
 */
export function defaultObjectives(base: CuratedGenre, levelTimeS: number): Objectives {
  const grammar = BASE_MANIFESTS[base].levelGrammar.kind;
  if (grammar === 'farm') {
    return {
      version: 1,
      win: { mode: 'all', clauses: [{ kind: 'hud_at_least', key: 'gold', value: 500 }] },
      lose: [{ kind: 'time_out', seconds: Math.max(300, Math.min(900, Math.round(levelTimeS * 2))) }],
    };
  }
  const arena = !grammarHasGoal(grammar);
  return {
    version: 1,
    win: { mode: 'all', clauses: [arena ? { kind: 'survive', seconds: Math.max(20, Math.min(900, Math.round(levelTimeS))) } : { kind: 'reach_goal' }] },
    lose: [{ kind: 'lives', count: arena ? 2 : 3 }],
  };
}
