import { StyleCard } from '@gg/schemas';
import seed from '../seed/reference_catalog.json';

/**
 * The style reference feature's legal boundary: a named game resolves to a card of unprotectable attributes
 * (palette mood, pixel density, outline rule, animation feel, camera, UI class, audio mood). The name and every
 * blocked term (characters, places, studios, signature items) stay private and never reach a prompt or a bundle.
 */
export interface ReferenceCard {
  family: StyleCard['family'];
  canvas: StyleCard['canvas'];
  pixelArt: boolean;
  palette: Omit<StyleCard['palette'], 'extra'>;
  outline: StyleCard['outline'];
  animationFps: StyleCard['animationFps'];
  camera: StyleCard['camera'];
  typography: StyleCard['typography'];
  audioMood: string[];
  postFx: StyleCard['postFx'];
  /** Plain-language attributes an art director can use ("cold blues with hot pink accents"). */
  notes: string[];
}

export interface ReferenceEntry {
  title: string;
  aliases: string[];
  riskTier: 'low' | 'medium' | 'high';
  card: ReferenceCard;
  blockedTerms: string[];
  /**
   * Ordinary words (and aliases) the game also uses as names ("knight", "survivors"). An idea keeps them, they never
   * cite the game, and the worker only reports them.
   */
  commonTerms?: string[];
}

export const CATALOG: readonly ReferenceEntry[] = (seed as { entries: ReferenceEntry[] }).entries;

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Match a free-text query ("like Celeste", "hades-style") to a catalog entry by title or alias. */
export function findReference(query: string): ReferenceEntry | null {
  const q = norm(query);
  if (!q) return null;
  let best: ReferenceEntry | null = null;
  let bestLen = 0;
  for (const e of CATALOG) {
    for (const name of [e.title, ...e.aliases]) {
      const n = norm(name);
      if (!n) continue;
      const hit = q === n || new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(q);
      if (hit && n.length > bestLen) {
        best = e;
        bestLen = n.length;
      }
    }
  }
  return best;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isCommon = (e: ReferenceEntry, term: string): boolean => (e.commonTerms ?? []).some((c) => norm(c) === norm(term));

export function resolveReferences(titles: readonly string[]): { matched: ReferenceEntry[]; unmatched: string[] } {
  const matched: ReferenceEntry[] = [];
  const unmatched: string[] = [];
  for (const t of titles) {
    const e = findReference(t);
    if (e && !matched.includes(e)) matched.push(e);
    else if (!e) unmatched.push(t);
  }
  return { matched, unmatched };
}

/**
 * Every term that must never appear in a prompt or public artifact for these references: their titles, aliases and
 * names, but not the ordinary words among them. A title the catalog does not know is blocked as written and by its
 * distinctive parts ("Metroid: Dread" blocks "Metroid: Dread", "Metroid Dread" and "Metroid").
 */
export function blockedTermsFor(entries: readonly ReferenceEntry[], unknownTitles: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const e of entries) for (const t of [e.title, ...e.aliases, ...e.blockedTerms]) if (t.trim().length > 2 && !isCommon(e, t)) out.add(t.trim());
  for (const t of unknownTitles) for (const part of titleParts(t)) out.add(part);
  return [...out];
}

/** A title as written, without its punctuation, and its parts of two words or six letters and more. */
function titleParts(title: string): string[] {
  const whole = title.trim().replace(/\s+/g, ' ');
  const parts = new Set([whole, whole.replace(/[:\u2013\u2014-]+/g, ' ').replace(/\s+/g, ' ').trim()]);
  for (const p of whole.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)) if (p.includes(' ') || p.length >= 6) parts.add(p.trim());
  return [...parts].filter((p) => p.length > 2);
}

/** The ordinary words these references also use as names: kept in an idea, and reported when it uses them. */
export function commonTermsFor(entries: readonly ReferenceEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.commonTerms ?? []))];
}

/** Words that start a citation: "like X", "inspired by X", "in the style of X", "X meets Y". */
const CITE = /(?:^|[^a-z0-9])(?:like|such as|inspired by|in the (?:style|spirit|vein) of|similar to|reminiscent of|a la|\u00e0 la|meets|references?:?)\s+/g;
/** Where a citation's list ends. */
const LIST_END = /[.;!?\n(]/;

/**
 * The catalog games an idea cites as references: right after "like", "inspired by", "in the style of" and the like,
 * listed with commas, "and" or "or" ("like Blasphemous and Dawn of Sorrow"), or as "Hades-like", "Celeste style" or
 * "Blasphemous meets". A title used as an ordinary word ("a blasphemous cult", "fight Hades") does not cite the game,
 * and nor does an ordinary word among its aliases ("a survivors game").
 */
export function referencesIn(text: string): ReferenceEntry[] {
  const lower = text.toLowerCase();
  const names = CATALOG.flatMap((entry) => [entry.title, ...entry.aliases].filter((n) => !isCommon(entry, n)).map((name) => ({ entry, name: norm(name), raw: name.toLowerCase() })))
    .filter((n) => n.name.length > 1)
    .sort((a, b) => b.name.length - a.name.length);
  const found: Array<{ at: number; entry: ReferenceEntry }> = [];
  const add = (at: number, entry: ReferenceEntry): void => {
    if (!found.some((f) => f.entry === entry)) found.push({ at, entry });
  };
  for (const m of lower.matchAll(CITE)) {
    const start = (m.index ?? 0) + m[0].length;
    const rest = lower.slice(start);
    const end = rest.search(LIST_END);
    const window = end < 0 ? rest.slice(0, 160) : rest.slice(0, end);
    // A list of names: it stops at the first item that does not start with one.
    for (const item of window.split(/,|&|\/|\+|\band\b|\bor\b/)) {
      const words = norm(item).replace(/^(the|a|an) /, '');
      const hit = names.find((n) => words === n.name || words.startsWith(`${n.name} `));
      if (!hit) break;
      add(start + Math.max(0, window.indexOf(item)), hit.entry);
    }
  }
  for (const n of names) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(n.raw)}(?:-(?:like|style|inspired|esque)|\\s+(?:style|meets))(?![a-z0-9])`);
    const m = re.exec(lower);
    if (m) add(m.index, n.entry);
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.entry);
}

/**
 * The references a create request names: its reference titles first, then the catalog games its idea cites. Titles
 * the catalog does not know come back unmatched, so their names can still be kept out of every prompt.
 */
export function referencesForRequest(prompt: string, titles: readonly string[]): { matched: ReferenceEntry[]; unmatched: string[] } {
  const named = resolveReferences(titles);
  const cited = referencesIn(prompt).filter((e) => !named.matched.includes(e));
  return { matched: [...named.matched, ...cited], unmatched: named.unmatched };
}

export const DEFAULT_NEGATIVE = ['no named characters from existing games', 'no logos, titles or wordmarks', 'no copied level layouts or dialogue', 'no distinctive UI chrome from existing games'];

/**
 * Merge reference cards into a style card. The first reference dominates the structural attributes (family,
 * canvas, palette, outline, animation, camera, typography, post-fx); audio moods and notes are unioned.
 */
export function styleFromReferences(entries: readonly ReferenceEntry[], base: StyleCard, name?: string): StyleCard {
  const first = entries[0];
  if (!first) return base;
  const audioMood = [...new Set(entries.flatMap((e) => e.card.audioMood))].slice(0, 6);
  const references = entries.flatMap((e) => e.card.notes.map((note) => ({ note: note.slice(0, 200) }))).slice(0, 6);
  const negative = [...new Set([...base.negative, ...DEFAULT_NEGATIVE])].slice(0, 20);
  return StyleCard.parse({
    ...base,
    name: name ?? base.name,
    family: first.card.family,
    canvas: first.card.canvas,
    pixelArt: first.card.pixelArt,
    palette: { ...first.card.palette, extra: [] },
    outline: first.card.outline,
    animationFps: first.card.animationFps,
    camera: first.card.camera,
    typography: first.card.typography,
    audioMood,
    postFx: first.card.postFx,
    references,
    negative,
  });
}

const wordRe = (term: string, flags: string): RegExp => new RegExp(`(^|[^a-z0-9])${escapeRe(term)}(?![a-z0-9])`, flags);

/** Replace blocked terms (whole words, case-insensitive, longest first) in free text; reports what was hit. */
export function sanitize(text: string, terms: readonly string[], replacement = 'a reference game'): { text: string; hits: string[] } {
  const hits: string[] = [];
  let out = text;
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const re = wordRe(term, 'gi');
    if (re.test(out)) {
      hits.push(term);
      out = out.replace(re, (_m, pre: string) => `${pre}${replacement}`);
    }
  }
  return { text: out, hits };
}

/** The terms that appear in the text (whole words, case-insensitive), which stays as it is. */
export function mentions(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => wordRe(t, 'i').test(text));
}

/** True when none of the terms appears in the text (the output IP screen for text artifacts). */
export function isClean(text: string, terms: readonly string[]): boolean {
  return sanitize(text, terms).hits.length === 0;
}
