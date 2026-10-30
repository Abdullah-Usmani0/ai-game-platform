import type { SpriteDesign, SpriteRamp, SpriteSheet } from '@gg/schemas';
import { isHostileDef, type EntityDef } from '@gg/sdk';
import { compileSprite, legendFor, paintFrames, playerRecipe, RAMP_SLOTS, rampsOf, recipeForType, RECIPES, spriteBases, type ArtPalette, type PixelCanvas, type Recipe, type RGB, type Setting, type Template } from '@gg/sdk/art';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

/** What a sprite is for in its game: the player, a thing that hurts, a thing to pick up, anything else. */
export type SpriteRole = 'player' | 'hostile' | 'pickup' | 'prop';

/** A type a game draws: what it is for and the shipped sprite it draws with, which a design of it starts from. */
export interface CastMember {
  type: string;
  role: SpriteRole;
  recipe: string;
}

/**
 * The types a game draws, the player first as '@player', each with what it is for and the shipped sprite it draws with
 * (a renamed type's archetype's). Crops are left out (a crop draws by its shape and colour, from the crop table), as are
 * types no shipped sprite draws.
 */
export function spriteCast(defs: readonly EntityDef[], player: { setting: Setting; w: number }): CastMember[] {
  const cast: CastMember[] = [{ type: '@player', role: 'player', recipe: playerRecipe(player.setting, player.w) }];
  for (const d of defs) {
    const recipe = recipeForType(d.type, d.drawAs);
    if (!recipe || (d.drawAs ?? d.type) === 'crop') continue;
    // A shot that hurts is read as a foe too: it must not wear the player's colours either.
    const hurts = isHostileDef(d) || (d.projectile === true && (d.contactDamage ?? 0) > 0);
    cast.push({ type: d.type, role: hurts ? 'hostile' : d.pickup ? 'pickup' : 'prop', recipe });
  }
  return cast;
}

const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The colours a frame shows and each one's share of them, ink and white left out: what the eye reads it by. */
function colourShares(pc: PixelCanvas, pal: ArtPalette): Array<{ c: RGB; share: number }> {
  const counts = new Map<number, { c: RGB; n: number }>();
  let total = 0;
  for (let i = 0; i < pc.data.length; i += 4) {
    if (pc.data[i + 3] === 0) continue;
    const c: RGB = [pc.data[i]!, pc.data[i + 1]!, pc.data[i + 2]!];
    if (distance(c, pal.ink) < 24 || distance(c, pal.white) < 24) continue;
    total++;
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    const e = counts.get(key);
    if (e) e.n++;
    else counts.set(key, { c, n: 1 });
  }
  return [...counts.values()].map((e) => ({ c: e.c, share: e.n / total })).sort((a, b) => b.share - a.share);
}

/** The share of a frame's colour in shades near any of some colours. */
function shareNear(pc: PixelCanvas, pal: ArtPalette, colours: readonly RGB[], within = 32): number {
  return colourShares(pc, pal).reduce((n, s) => n + (colours.some((c) => distance(s.c, c) < within) ? s.share : 0), 0);
}

/**
 * The colours a sprite is known by: every shade of each colour that paints a tenth of its first frame or more (the eye
 * reads a ramp's shades as one colour), ink and white aside. A player's skin counts only when its design gives it its
 * own colour (the shipped player is known by its clothes and hair, which the palette keeps away from the danger hue).
 */
function knownBy(recipe: Recipe, pal: ArtPalette, design?: SpriteDesign): RGB[] {
  const legend = legendFor(pal, recipe.tune?.(pal));
  const skin = design?.recolor?.hero === undefined ? RAMP_SLOTS.hero : {};
  const counts = new Map<string, number>();
  let total = 0;
  for (const ch of Object.values(recipe.anims)[0]![0]!.join('')) {
    if (!legend[ch] || ch === 'k' || ch === 'w') continue;
    total++;
    if (!(ch in skin)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  const known = new Set<string>();
  for (const [ch, n] of counts) {
    if (n < total / 10) continue;
    const r = (Object.keys(RAMP_SLOTS) as SpriteRamp[]).find((k) => ch in RAMP_SLOTS[k]);
    for (const slot of r ? Object.keys(RAMP_SLOTS[r]) : [ch]) known.add(slot);
  }
  return [...known].flatMap((ch) => (legend[ch] ? [legend[ch]] : []));
}

/** Share of pixels that differ between two frames of one size. */
function changed(a: PixelCanvas, b: PixelCanvas): number {
  let n = 0;
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const on = a.data[i + 3]! > 0 || b.data[i + 3]! > 0;
    if (!on) continue;
    total++;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++;
  }
  return total === 0 ? 0 : n / total;
}

/** A design's frames painted in the palette, or the issue that keeps it from being painted. */
function paint(design: SpriteDesign, pal: ArtPalette): { frames: ReturnType<typeof paintFrames> } | { issue: Issue } {
  try {
    return { frames: paintFrames(compileSprite(design), pal) };
  } catch (e) {
    return { issue: err('sprite_compile', `${design.type}: ${(e as Error).message}`, { path: design.type }) };
  }
}

const clear = (ch: string | undefined) => ch === undefined || ch === '.' || ch === ' ';

/** Of the frame the overlays change most, the share of the base's own pixels they change (recolours change none). */
function overlayShare(base: Recipe, mine: Recipe): number {
  let most = 0;
  for (const [name, frames] of Object.entries(base.anims)) {
    frames.forEach((f, i) => {
      const g = mine.anims[name]?.[i] ?? f;
      let own = 0;
      let changed = 0;
      f.forEach((row, y) => {
        for (let x = 0; x < Math.max(row.length, g[y]?.length ?? 0); x++) {
          const a = clear(row[x]) ? '.' : row[x];
          const b = clear(g[y]?.[x]) ? '.' : g[y]![x];
          if (a !== '.') own++;
          if (a !== b) changed++;
        }
      });
      if (own > 0) most = Math.max(most, changed / own);
    });
  }
  return most;
}

/** Islands of pixels in a template, touching at a side or a corner. */
function islands(t: Template): number {
  const w = Math.max(...t.map((r) => r.length));
  const seen = new Set<number>();
  let n = 0;
  for (let y = 0; y < t.length; y++) {
    for (let x = 0; x < w; x++) {
      if (clear(t[y]![x]) || seen.has(y * w + x)) continue;
      n++;
      seen.add(y * w + x);
      const stack: Array<[number, number]> = [[x, y]];
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (ny < 0 || ny >= t.length || clear(t[ny]![nx]) || seen.has(ny * w + nx)) continue;
            seen.add(ny * w + nx);
            stack.push([nx, ny]);
          }
        }
      }
    }
  }
  return n;
}

/** What a design is checked against: the game's palette, what the type is for, the shipped sprite it draws with. */
export interface SpriteContext {
  pal: ArtPalette;
  role: SpriteRole;
  /** The shipped recipe the type draws with: a design starts from a sprite of the same build. */
  recipe: string;
  /** The colours the player is known by, which hostiles must not wear. */
  player?: readonly RGB[];
}

/**
 * One design against its base and the game's look. Errors keep it from drawing as designed: a base that does not
 * exist or is not of the type's build (its size, where it stands, whether it faces four ways), an overlay off the frame
 * or on an animation the base has not got, overlays that change more than two thirds of a frame. Warnings are a sprite that
 * would read poorly or a design that does less than it says: pixels floating apart from the body, a recolour of a ramp
 * the base does not paint with, its own colours melting into the floor, a hostile in the player's colours.
 */
export function checkSprite(design: SpriteDesign, ctx: SpriteContext): Issue[] {
  const issues: Issue[] = [];
  const base = RECIPES[design.base];
  const at = { path: design.type };
  if (!base) return [err('sprite_base', `${design.type}: no shipped sprite '${design.base}'`, at)];
  const bases = spriteBases(ctx.recipe);
  if (!bases.includes(design.base)) return [err('sprite_build', `${design.type} draws as '${ctx.recipe}': start from one of ${bases.join(', ')}, not '${design.base}'`, at)];
  const first = Object.values(base.anims)[0]![0]!;
  const w = Math.max(...first.map((r) => r.length));
  const h = first.length;
  for (const o of design.overlays) {
    const ow = Math.max(...o.rows.map((r) => r.length));
    if (o.x + ow > w || o.y + o.rows.length > h) issues.push(err('overlay_outside', `${design.type}: an overlay of ${ow} x ${o.rows.length} at ${o.x},${o.y} runs off the ${w} x ${h} frame of '${design.base}'`, at));
    if (o.anims !== '*') for (const a of o.anims) if (!base.anims[a]) issues.push(err('overlay_anim', `${design.type}: '${design.base}' has no animation '${a}' (it has ${Object.keys(base.anims).join(', ')})`, at));
  }
  if (issues.length > 0) return issues;

  let mine: Recipe;
  try {
    mine = compileSprite(design, base);
  } catch (e) {
    return [err('sprite_compile', `${design.type}: ${(e as Error).message}`, at)];
  }
  // Overlays add to the base, never bury it: a design that redraws most of a frame is a new drawing, not this sprite.
  const share = overlayShare(base, mine);
  if (share > 2 / 3) issues.push(err('overlay_heavy', `${design.type}: the overlays change ${Math.round(share * 100)}% of a frame of '${design.base}' (two thirds at most): they bury it`, at));
  // Pixels apart from the body read as dirt on the screen.
  const apart = Object.entries(base.anims).find(([name, frames]) => frames.some((f, i) => islands(mine.anims[name]![i]!) > islands(f)));
  if (apart) issues.push(warn('sprite_scattered', `${design.type}: the overlays leave pixels apart from the body in '${apart[0]}': join them to it`, at));
  const letters = new Set(Object.values(mine.anims).flatMap((frames) => frames.flatMap((f) => [...f.join('')])));
  for (const r of Object.keys(design.recolor ?? {}) as SpriteRamp[]) {
    if (Object.keys(RAMP_SLOTS[r]).some((ch) => letters.has(ch))) continue;
    const painted = Object.keys(rampsOf(mine));
    issues.push(warn('recolor_unused', `${design.type}: '${design.base}' paints nothing with the ${r} ramp, so its colour changes nothing (it paints with ${painted.join(', ') || 'fixed colours only'})`, at));
  }

  // How it reads: against the floor (where its own colours put it there), a hostile against the player.
  const painted = paintFrames(mine, ctx.pal)[0]!.pc;
  const floor = [ctx.pal.floor[2]];
  const blends = (pc: PixelCanvas) => shareNear(pc, ctx.pal, floor, 40) >= 0.5;
  if (ctx.role !== 'prop' && ctx.pal.outline === 'none' && blends(painted) && !blends(paintFrames(base, ctx.pal)[0]!.pc)) issues.push(warn('sprite_blends', `${design.type} is mostly the floor's colour: with no outline it melts into the ground`, at));
  if (ctx.role === 'hostile' && ctx.player && shareNear(painted, ctx.pal, ctx.player) >= 0.5) issues.push(warn('looks_like_player', `${design.type} is a hostile in the player's colours: the player cannot tell friend from foe`, at));
  return issues;
}

/** The colours a player drawn by a design (or as it ships, without one) is known by, which hostiles are held against. */
export function playerColours(recipe: string, pal: ArtPalette, design?: SpriteDesign): RGB[] | undefined {
  try {
    const r = design ? compileSprite(design) : RECIPES[recipe];
    return r ? knownBy(r, pal, design) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A game's sprite designs (content/sprites.json) against its cast, the player among it as '@player': each design for
 * a type the game draws, sound by checkSprite, no two types drawn alike, and no hostile in the player's colours (a
 * player's design is held against the hostiles drawn as they ship too).
 */
export function checkSpriteSheet(sheet: SpriteSheet, ctx: { pal: ArtPalette; types: readonly CastMember[] }): ValidationReport {
  const issues: Issue[] = [];
  const types = new Map(ctx.types.map((t) => [t.type, t]));
  const shipped = (t: CastMember) => (RECIPES[t.recipe] ? paintFrames(RECIPES[t.recipe]!, ctx.pal)[0]!.pc : undefined);
  const playerDesign = sheet.sprites.find((d) => d.type === '@player');
  const playerCast = ctx.types.find((t) => t.role === 'player');
  const player = playerCast ? playerColours(playerCast.recipe, ctx.pal, playerDesign) : undefined;
  const firsts = new Map<string, PixelCanvas>();
  for (const d of sheet.sprites) {
    const t = types.get(d.type);
    if (!t) {
      issues.push(err('sprite_type_unknown', `a design for '${d.type}', which the game does not draw (it draws ${[...types.keys()].join(', ')})`, { path: d.type }));
      continue;
    }
    const own = checkSprite(d, { pal: ctx.pal, role: t.role, recipe: t.recipe, ...(player ? { player } : {}) });
    issues.push(...own);
    if (own.some((i) => i.severity === 'error')) continue;
    const painted = paint(d, ctx.pal);
    if ('frames' in painted) firsts.set(d.type, painted.frames[0]!.pc);
  }
  if (playerDesign && player) {
    for (const t of ctx.types) {
      const pc = t.role === 'hostile' && !firsts.has(t.type) ? shipped(t) : undefined;
      if (pc && shareNear(pc, ctx.pal, player) >= 0.5) issues.push(warn('looks_like_player', `@player wears the colours of ${t.type}, a hostile drawn as it ships: the player cannot tell friend from foe`, { path: '@player' }));
    }
  }
  const drawn = [...firsts];
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const [a, pa] = drawn[i]!;
      const [b, pb] = drawn[j]!;
      if (pa.w === pb.w && pa.h === pb.h && changed(pa, pb) < 0.05) issues.push(warn('sprites_alike', `${a} and ${b} look the same: give one its own colours or a mark`, { path: b }));
    }
  }
  return report(issues, { designs: sheet.sprites.length });
}
