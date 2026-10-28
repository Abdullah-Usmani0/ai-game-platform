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

/** Every term that must never appear in a prompt or public artifact for these references. */
export function blockedTermsFor(entries: readonly ReferenceEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) for (const t of [e.title, ...e.aliases, ...e.blockedTerms]) if (t.trim().length > 2) out.add(t.trim());
  return [...out];
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

/** Replace blocked terms (whole words, case-insensitive, longest first) in free text; reports what was hit. */
export function sanitize(text: string, terms: readonly string[], replacement = 'a reference game'): { text: string; hits: string[] } {
  const hits: string[] = [];
  let out = text;
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'gi');
    if (re.test(out)) {
      hits.push(term);
      out = out.replace(re, (_m, pre: string) => `${pre}${replacement}`);
    }
  }
  return { text: out, hits };
}

/** True when none of the terms appears in the text (the output IP screen for text artifacts). */
export function isClean(text: string, terms: readonly string[]): boolean {
  return sanitize(text, terms).hits.length === 0;
}
