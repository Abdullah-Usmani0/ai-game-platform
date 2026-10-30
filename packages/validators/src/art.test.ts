import { SpriteDesign } from '@gg/schemas';
import { artPalette, RECIPES, type OutlineMode, type RGB } from '@gg/sdk/art';
import { describe, expect, it } from 'vitest';
import { checkSprite, checkSpriteSheet, playerColours, spriteCast, type SpriteRole } from './art.js';
import type { Issue } from './report.js';

const ROLES = { background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' };
const pal = artPalette(ROLES);
const design = (d: Record<string, unknown>) => SpriteDesign.parse({ type: 'x', ...d });
const codes = (issues: readonly Issue[]) => issues.map((i) => `${i.severity}:${i.code}`);
const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('checkSprite', () => {
  it('passes every shipped sprite drawn as itself, in every outline mode and role', () => {
    for (const outline of ['none', 'dark', 'colored', 'selective'] as OutlineMode[]) {
      const p = artPalette(ROLES, outline);
      for (const name of Object.keys(RECIPES)) {
        for (const role of ['player', 'hostile', 'pickup', 'prop'] as SpriteRole[]) expect(checkSprite(design({ base: name }), { pal: p, role, recipe: name }), `${name} ${outline} ${role}`).toEqual([]);
      }
    }
  });

  it('passes a design on another sprite of the same build, with its own colours and marks', () => {
    const beetle = design({ base: 'walker', recolor: { danger: '#2f7f6a' }, overlays: [{ x: 6, y: 0, rows: ['k.', '.k'] }] });
    expect(checkSprite(beetle, { pal, role: 'hostile', recipe: 'walker' })).toEqual([]);
    expect(checkSprite(design({ base: 'grunt' }), { pal, role: 'hostile', recipe: 'walker' })).toEqual([]);
  });

  it('refuses a base that is not shipped or not of the build its type draws with', () => {
    expect(codes(checkSprite(design({ base: 'dragon' }), { pal, role: 'hostile', recipe: 'walker' }))).toEqual(['error:sprite_base']);
    const wrong = checkSprite(design({ base: 'walker' }), { pal, role: 'player', recipe: 'ship' });
    expect(codes(wrong)).toEqual(['error:sprite_build']);
    expect(wrong[0]!.message).toMatch(/start from one of .*ship/);
  });

  it('refuses overlays off the frame or on animations the base has not got', () => {
    expect(codes(checkSprite(design({ base: 'walker', overlays: [{ x: 6, y: 0, rows: ['kkk'] }] }), { pal, role: 'hostile', recipe: 'walker' }))).toEqual(['error:overlay_outside']);
    expect(codes(checkSprite(design({ base: 'walker', overlays: [{ x: 0, y: 7, rows: ['k', 'k'] }] }), { pal, role: 'hostile', recipe: 'walker' }))).toEqual(['error:overlay_outside']);
    const anim = checkSprite(design({ base: 'walker', overlays: [{ anims: ['fly'], x: 0, y: 0, rows: ['k'] }] }), { pal, role: 'hostile', recipe: 'walker' });
    expect(codes(anim)).toEqual(['error:overlay_anim']);
    expect(anim[0]!.message).toMatch(/has no animation 'fly' \(it has run, hurt\)/);
  });

  it('refuses overlays that redraw most of the base', () => {
    const buried = checkSprite(design({ base: 'walker', overlays: [{ x: 0, y: 1, rows: Array(7).fill('mmmmmmmm') }] }), { pal, role: 'hostile', recipe: 'walker' });
    expect(codes(buried)).toContain('error:overlay_heavy');
  });

  it('warns of pixels apart from the body and of a recolour that changes nothing', () => {
    expect(codes(checkSprite(design({ base: 'walker', overlays: [{ x: 0, y: 0, rows: ['k'] }] }), { pal, role: 'hostile', recipe: 'walker' }))).toEqual(['warning:sprite_scattered']);
    const unused = checkSprite(design({ base: 'walker', recolor: { garment: '#3060c0' } }), { pal, role: 'hostile', recipe: 'walker' });
    expect(codes(unused)).toEqual(['warning:recolor_unused']);
    expect(unused[0]!.message).toMatch(/paints with danger/);
    // A ramp the overlays paint with is used, though the base has none of it.
    expect(checkSprite(design({ base: 'walker', recolor: { rim: '#dff1ff' }, overlays: [{ x: 3, y: 0, rows: ['YY'] }] }), { pal, role: 'hostile', recipe: 'walker' })).toEqual([]);
  });

  it("warns of a sprite in the floor's colour with no outline, and of a hostile in the player's colours", () => {
    const flat = artPalette(ROLES, 'none');
    const floor = design({ base: 'walker', recolor: { danger: hex(flat.floor[2]) } });
    expect(codes(checkSprite(floor, { pal: flat, role: 'hostile', recipe: 'walker' }))).toEqual(['warning:sprite_blends']);
    // A prop may blend in; with an outline nothing does.
    expect(checkSprite(floor, { pal: flat, role: 'prop', recipe: 'walker' })).toEqual([]);
    expect(checkSprite(floor, { pal, role: 'hostile', recipe: 'walker' })).toEqual([]);
    // The player as it ships is known by its clothes and hair, not its skin: a hostile in its shirt's colour is flagged.
    const player = playerColours('hero-side', pal)!;
    const shirt = design({ base: 'walker', recolor: { danger: hex(pal.garment[2]) } });
    expect(codes(checkSprite(shirt, { pal, role: 'hostile', recipe: 'walker', player }))).toEqual(['warning:looks_like_player']);
    expect(checkSprite(shirt, { pal, role: 'pickup', recipe: 'walker', player })).toEqual([]);
    expect(checkSprite(design({ base: 'walker', recolor: { danger: hex(pal.hero[2]) } }), { pal, role: 'hostile', recipe: 'walker', player })).toEqual([]);
  });
});

describe('checkSpriteSheet', () => {
  const cast = spriteCast(
    [
      { type: 'beetle', w: 8, h: 8, contactDamage: 1, drawAs: 'walker' },
      { type: 'frog', w: 8, h: 8, fsm: 'hopper', drawAs: 'hopper' },
      { type: 'lantern', w: 6, h: 6, pickup: true, drawAs: 'coin' },
      { type: 'spore', w: 4, h: 4, projectile: true, contactDamage: 1, drawAs: 'bolt' },
      { type: 'sprout', w: 8, h: 8, drawAs: 'crop' },
      { type: 'stranger', w: 8, h: 8 },
    ],
    { setting: 'side', w: 8 },
  );

  it('lists the types a game draws with their roles and shipped sprites, the player first', () => {
    expect(cast).toEqual([
      { type: '@player', role: 'player', recipe: 'hero-side' },
      { type: 'beetle', role: 'hostile', recipe: 'walker' },
      { type: 'frog', role: 'hostile', recipe: 'hopper' },
      { type: 'lantern', role: 'pickup', recipe: 'coin' },
      { type: 'spore', role: 'hostile', recipe: 'orb' },
    ]);
  });

  it("checks each design against its type, and the cast's hostiles against the player's design", () => {
    const sheet = {
      version: 1 as const,
      sprites: [design({ type: '@player', base: 'hero-side', recolor: { garment: '#7a68a6' } }), design({ type: 'beetle', base: 'walker', recolor: { danger: '#7a68a6' } }), design({ type: 'ghost', base: 'bat' })],
    };
    const r = checkSpriteSheet(sheet, { pal, types: cast });
    expect(r.ok).toBe(false);
    expect(codes(r.issues)).toEqual(['warning:looks_like_player', 'error:sprite_type_unknown']);
    expect(r.issues[0]!.at?.path).toBe('beetle');
    expect(r.metrics['designs']).toBe(3);
  });

  it("holds a player's design against the hostiles drawn as they ship", () => {
    const red = { version: 1 as const, sprites: [design({ type: '@player', base: 'hero-side', recolor: { garment: ROLES.danger, accent: ROLES.danger } })] };
    const r = checkSpriteSheet(red, { pal, types: cast });
    expect(codes(r.issues)).toEqual(['warning:looks_like_player', 'warning:looks_like_player']);
    expect(r.issues.map((i) => i.message)).toEqual([expect.stringMatching(/^@player wears the colours of beetle/), expect.stringMatching(/^@player wears the colours of spore/)]);
    expect(checkSpriteSheet({ version: 1, sprites: [design({ type: '@player', base: 'hero-side', recolor: { garment: '#3060c0' } })] }, { pal, types: cast }).issues).toEqual([]);
  });

  it('warns when two types are drawn alike', () => {
    const r = checkSpriteSheet({ version: 1, sprites: [design({ type: 'beetle', base: 'walker' }), design({ type: 'frog', base: 'walker' })] }, { pal, types: cast });
    expect(r.ok).toBe(true);
    expect(codes(r.issues)).toEqual(['warning:sprites_alike']);
  });
});
