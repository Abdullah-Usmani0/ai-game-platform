import type { EntityDef } from '@gg/sdk';
import { ABILITY_DASH, ABILITY_DOUBLE_JUMP, BOOTS_TYPE, RELIC_ABILITY, WINGS_TYPE } from '@gg/template-metroidvania';

export { ABILITY_DASH, ABILITY_DOUBLE_JUMP, BOOTS_TYPE, RELIC_ABILITY, WINGS_TYPE };
export const ALTAR_TYPE = 'altar';
export const SOUL_TYPE = 'soul';
export const GHOUL_TYPE = 'ghoul';
export const HOUND_TYPE = 'hound';
export const GARGOYLE_TYPE = 'gargoyle';
export const SENTINEL_TYPE = 'sentinel';
export const WRAITH_TYPE = 'wraith';
export const ARCHER_TYPE = 'bone-archer';
/** The region's boss, in a room of its own before the way out (a `boss` room the arena shuts). */
export const HEADSMAN_TYPE = 'headsman';
/** A grate in a floor that opens from below (the shortcuts system): four tiles wide, one deep (the floor's top row). */
export const GATE_TYPE = 'gate';

/**
 * The castle tier's hero: a 14x42 body (2.6 tiles of 16 px), drawn by the rig in larger frames around it. Five hearts:
 * a region is long, and a rest at an altar refills them.
 */
export const PLAYER = { w: 14, h: 42, hp: 5 } as const;

/**
 * The castle's cast at 16 px tiles. A foe takes cuts to fell: the ghoul three (the whole chain, or the cut and the
 * thrust), the hound two, the stone gargoyle four, the sentinel five, the wraith three, the bone archer two. Every one but
 * the sentinel is low enough for the plainest jump of the heaviest feel to clear (28 px against a 37 px rise): the
 * sentinel holds its hall behind its shield until it is beaten (or flown over with the wings). The wraith floats a tile
 * over the floor and hurts only with its hexes: it fades through the hero unharmed and unharming. Shots (the gargoyle's
 * embers, the wraith's hexes, the archer's arrows) can be cut out of the air.
 */
export const ENTITY_DEFS: EntityDef[] = [
  { type: GHOUL_TYPE, w: 16, h: 28, hp: 3, gravity: true, fsm: 'ghoul', contactDamage: 1 },
  { type: HOUND_TYPE, w: 24, h: 16, hp: 2, gravity: true, fsm: 'hound', contactDamage: 1 },
  { type: GARGOYLE_TYPE, w: 20, h: 24, hp: 4, gravity: true, fsm: 'gargoyle', contactDamage: 1 },
  { type: SENTINEL_TYPE, w: 20, h: 44, hp: 5, gravity: true, fsm: 'sentinel', contactDamage: 1 },
  { type: WRAITH_TYPE, w: 16, h: 28, hp: 3, gravity: false, fsm: 'wraith', contactDamage: 0 },
  { type: ARCHER_TYPE, w: 14, h: 34, hp: 2, gravity: true, fsm: 'bone-archer', contactDamage: 1 },
  { type: HEADSMAN_TYPE, w: 36, h: 64, hp: 36, gravity: true, fsm: 'headsman', contactDamage: 0, boss: true },
  { type: 'ember', w: 6, h: 6, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'hex', w: 8, h: 8, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'shaft', w: 12, h: 3, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: 'wave', w: 16, h: 10, hp: 1, gravity: false, projectile: true, contactDamage: 1 },
  { type: SOUL_TYPE, w: 8, h: 8, hp: 1, gravity: false, pickup: true },
  { type: WINGS_TYPE, w: 12, h: 12, gravity: false, tint: 'accent' },
  { type: BOOTS_TYPE, w: 12, h: 12, gravity: false, tint: 'accent' },
  { type: ALTAR_TYPE, w: 16, h: 32, gravity: false, tint: 'ui' },
  { type: GATE_TYPE, w: 64, h: 16, gravity: false, tint: 'mid' },
];

/**
 * The foes that carry a shield, and how much battering their guard takes before it breaks (in the poise of the blows it
 * turns aside: three cuts for the sentinel). A guard turns aside blows from the side its bearer faces (castle combat).
 */
export const GUARDS: Readonly<Record<string, number>> = { [SENTINEL_TYPE]: 30 };

export const COLLECTIBLE_TYPES = [SOUL_TYPE];
export const ENEMY_TYPES: readonly string[] = ENTITY_DEFS.filter((d) => d.fsm).map((d) => d.type);
/** The bosses: each fights in a `boss` room of its own, which the arena shuts while it lives. */
export const BOSS_TYPES: readonly string[] = ENTITY_DEFS.filter((d) => d.boss === true).map((d) => d.type);
/** The relics and the ability flag each grants (the gated movement reads them); abilities last as `ab:` props. */
export const RELIC_TYPES: readonly string[] = Object.keys(RELIC_ABILITY);
export const ABILITIES: readonly string[] = [ABILITY_DOUBLE_JUMP, ABILITY_DASH];
