import { StyleCard } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { blockedTermsFor, CATALOG, commonTermsFor, findReference, isClean, mentions, referencesForRequest, referencesIn, resolveReferences, sanitize, styleFromReferences } from './index.js';

const BASE: StyleCard = StyleCard.parse({
  version: 1,
  name: 'base',
  family: '16bit',
  canvas: { w: 320, h: 180 },
  pixelArt: true,
  palette: { background: '#000000', mid: '#444444', foreground: '#ffffff', accent: '#ffcc00', danger: '#ff0000', ui: '#ffffff' },
  outline: 'dark',
  animationFps: { character: 10, effects: 15 },
  camera: { follow: 'lerp', lerp: 0.1, deadzone: { w: 32, h: 24 }, maxShake: 0.5, zoom: 1 },
  typography: { font: 'press-start-2p', size: 8 },
  audioMood: ['chiptune'],
  postFx: { vignette: false, bloom: false, crt: false },
});

describe('reference catalog', () => {
  it('has well-formed entries whose cards merge into valid style cards', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(20);
    for (const e of CATALOG) {
      expect(e.title.length).toBeGreaterThan(1);
      expect(e.card.notes.length).toBeGreaterThan(0);
      expect(e.blockedTerms.length).toBeGreaterThan(0);
      const style = styleFromReferences([e], BASE, 'test');
      expect(StyleCard.safeParse(style).success, e.title).toBe(true);
      // The card must not smuggle the title or a blocked term into notes.
      for (const note of e.card.notes) expect(isClean(note, blockedTermsFor([e])), `${e.title}: ${note}`).toBe(true);
    }
  });
  it('resolves titles and aliases from free text and reports unknown ones', () => {
    expect(findReference('in the style of Celeste')?.title).toBe('Celeste');
    expect(findReference('HADES')?.title).toBe('Hades');
    expect(findReference('Stardew')?.title).toBe('Stardew Valley');
    expect(findReference('some unknown game')).toBeNull();
    const r = resolveReferences(['Dead Cells', 'Nonexistent Quest', 'dead cells']);
    expect(r.matched.map((e) => e.title)).toEqual(['Dead Cells']);
    expect(r.unmatched).toEqual(['Nonexistent Quest']);
  });
  it('sanitises blocked terms out of prompts', () => {
    const terms = blockedTermsFor(resolveReferences(['Hades']).matched);
    const { text, hits } = sanitize('A roguelike like Hades where Zagreus escapes Tartarus; hadestown is unrelated.', terms);
    expect(hits).toEqual(expect.arrayContaining(['Hades', 'Zagreus', 'Tartarus']));
    expect(text).not.toMatch(/Hades|Zagreus|Tartarus/);
    expect(text).toContain('hadestown');
    expect(isClean(text, terms)).toBe(true);
  });
  it('keeps the ordinary words a game also uses as names, and blocks its names', () => {
    const hk = resolveReferences(['Hollow Knight']).matched;
    const idea = 'A knight with a hornet familiar climbs toward the radiance of a dead kingdom; no Hallownest, no Pale King.';
    const { text, hits } = sanitize(idea, blockedTermsFor(hk));
    expect(text).toContain('A knight with a hornet familiar climbs toward the radiance of a dead kingdom');
    expect(text).not.toMatch(/Hallownest|Pale King/);
    expect(hits).toEqual(expect.arrayContaining(['Hallownest', 'Pale King']));
    expect(mentions(text, commonTermsFor(hk))).toEqual(['Knight', 'Hornet', 'Radiance']);
    // An ordinary word among the aliases is not stripped either.
    const vs = blockedTermsFor(resolveReferences(['Vampire Survivors']).matched);
    expect(sanitize('An arena survivors game, unlike Vampire Survivors.', vs).text).toBe('An arena survivors game, unlike a reference game.');
  });
  it('lists every ordinary word apart from the names it would otherwise block', () => {
    for (const e of CATALOG) {
      const blocked = blockedTermsFor([e]).map((t) => t.toLowerCase());
      for (const c of e.commonTerms ?? []) expect(blocked, `${e.title}: ${c}`).not.toContain(c.toLowerCase());
    }
  });
  it('blocks a title the catalog does not know, whole and by its distinctive parts', () => {
    const { text } = sanitize('Like Metroid Dread, or any Metroid, with a dread atmosphere.', blockedTermsFor([], ['Metroid: Dread']));
    expect(text).toBe('Like a reference game, or any a reference game, with a dread atmosphere.');
  });
  it('finds the games an idea cites, and not titles used as ordinary words', () => {
    const titles = (t: string): string[] => referencesIn(t).map((e) => e.title);
    expect(titles('A gothic game like Blasphemous and Castlevania: Dawn of Sorrow, with heavy parries and Hades bosses.')).toEqual(['Blasphemous', 'Castlevania: Dawn of Sorrow']);
    expect(titles('A Hades-like dungeon run, in the style of Celeste')).toEqual(['Hades', 'Celeste']);
    expect(titles('Inspired by hollow knight; a blasphemous cult rises and you fight Hades in the underworld.')).toEqual(['Hollow Knight']);
    expect(titles('An arena survivors game where I would like a knight')).toEqual([]);
    expect(titles('Stardew meets Spelunky')).toEqual(['Stardew Valley', 'Spelunky']);
  });
  it("puts a request's reference titles first, then the games its idea cites", () => {
    expect(findReference('Castlevania: Dawn of Sorrow')?.title).toBe('Castlevania: Dawn of Sorrow');
    expect(findReference('castlevania')?.title).toBe('Castlevania: Dawn of Sorrow');
    const r = referencesForRequest('Gothic and grim, like Blasphemous.', ['Dawn of Sorrow', 'Metroid Dread', 'blasphemous']);
    expect(r.matched.map((e) => e.title)).toEqual(['Castlevania: Dawn of Sorrow', 'Blasphemous']);
    expect(r.unmatched).toEqual(['Metroid Dread']);
  });
  it('merges several references: first dominates structure, moods union', () => {
    const { matched } = resolveReferences(['Celeste', 'Hades']);
    const style = styleFromReferences(matched, BASE, 'mix');
    expect(style.family).toBe('16bit');
    expect(style.audioMood).toEqual(expect.arrayContaining(['piano', 'rock']));
    expect(style.references.length).toBeGreaterThan(3);
    expect(style.negative.length).toBeGreaterThan(2);
  });
});
