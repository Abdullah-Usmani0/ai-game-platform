import { StyleCard } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { blockedTermsFor, CATALOG, findReference, isClean, resolveReferences, sanitize, styleFromReferences } from './index.js';

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
  it('merges several references: first dominates structure, moods union', () => {
    const { matched } = resolveReferences(['Celeste', 'Hades']);
    const style = styleFromReferences(matched, BASE, 'mix');
    expect(style.family).toBe('16bit');
    expect(style.audioMood).toEqual(expect.arrayContaining(['piano', 'rock']));
    expect(style.references.length).toBeGreaterThan(3);
    expect(style.negative.length).toBeGreaterThan(2);
  });
});
