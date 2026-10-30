import type { Crop } from '@gg/schemas';
import type { Entity, InputState, SimCtx } from '@gg/sdk';

/**
 * What the farm's systems share: the crops a game grows, which way the player faces, the tile in front of it, what
 * stands there, and the player's purse, energy and bag. Each system tracks the facing itself from the same inputs, so
 * they always agree on the tile, whichever of them a game selects.
 */

/** The crops a farm grows when its content names none: quick turnips, leafy lettuce, tomatoes that bear again, tall corn. */
export const DEFAULT_CROPS: readonly Crop[] = [
  { id: 'turnip', name: 'Turnip', seedPrice: 10, sellPrice: 30, growDays: 2, look: { shape: 'root', color: '#efe3f2' } },
  { id: 'lettuce', name: 'Lettuce', seedPrice: 15, sellPrice: 55, growDays: 3, look: { shape: 'leafy', color: '#8fd16a' } },
  { id: 'tomato', name: 'Tomato', seedPrice: 35, sellPrice: 40, growDays: 4, regrowDays: 2, look: { shape: 'bush', color: '#e2483c' } },
  { id: 'corn', name: 'Corn', seedPrice: 40, sellPrice: 140, growDays: 5, look: { shape: 'tall', color: '#f3c74a' } },
];

const isCrop = (c: unknown): c is Crop => {
  const x = c as Partial<Crop> | null;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.seedPrice === 'number' && typeof x.sellPrice === 'number' && typeof x.growDays === 'number' && !!x.look;
};

/** The crops of the game: content/crops.json when it lists any, else the default four. */
export function cropsOf(ctx: Pick<SimCtx, 'content'>): readonly Crop[] {
  const t = ctx.content['crops'] as { crops?: unknown[] } | undefined;
  const crops = Array.isArray(t?.crops) ? t.crops.filter(isCrop) : [];
  return crops.length > 0 ? crops : DEFAULT_CROPS;
}

/** The shop offers the first this many of the game's crops (a menu shows four cards). */
export const SHELF = 4;

/** Hours the farm day runs: from six in the morning until two at night, when the player falls asleep where it stands. */
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 26 * 60;

export interface Facing {
  fx: number;
  fy: number;
  prevAction: boolean;
  prevJump: boolean;
  /** The last tick this system ran: a gap is a menu or a pause it did not see. */
  lastTick: number;
}

export const facingStart = (): Facing => ({ fx: 0, fy: 1, prevAction: false, prevJump: false, lastTick: -2 });

/**
 * Turns the player toward the arrow pressed alone; along a diagonal it keeps facing whichever of the two axes it already
 * faced (or the horizontal one). Returns whether action (and jump, for a system that asks) was newly pressed this tick;
 * it reads no other key. After a menu or a pause the system did not see, a key still held from the pick is not a new
 * press.
 */
export function track(f: Facing, input: InputState, tick: number, withJump = false): { action: boolean; jump: boolean } {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 && dy === 0) {
    f.fx = dx;
    f.fy = 0;
  } else if (dy !== 0 && dx === 0) {
    f.fx = 0;
    f.fy = dy;
  } else if (dx !== 0 && dy !== 0 && f.fx !== dx && f.fy !== dy) {
    f.fx = dx;
    f.fy = 0;
  }
  const fresh = tick === f.lastTick + 1;
  const jump = withJump && input.jump;
  const pressed = { action: fresh && input.action && !f.prevAction, jump: fresh && jump && !f.prevJump };
  f.prevAction = input.action;
  f.prevJump = jump;
  f.lastTick = tick;
  return pressed;
}

/** The tile under the player's centre. */
export function playerTile(ctx: Pick<SimCtx, 'world' | 'map'>): { tx: number; ty: number } {
  const p = ctx.world.player;
  const ts = ctx.map.tileSize;
  return { tx: Math.floor((p.x + p.w / 2) / ts), ty: Math.floor((p.y + p.h / 2) / ts) };
}

/** The tile the player faces: one step from the tile under its centre. */
export function facedTile(ctx: Pick<SimCtx, 'world' | 'map'>, f: Facing): { tx: number; ty: number } {
  const t = playerTile(ctx);
  return { tx: t.tx + f.fx, ty: t.ty + f.fy };
}

/** The living entity of a type covering a tile (a two-tile stall counts on both). */
export function entityAt(ctx: Pick<SimCtx, 'world' | 'map'>, type: string, tx: number, ty: number): Entity | undefined {
  const ts = ctx.map.tileSize;
  const x = tx * ts + ts / 2;
  const y = ty * ts + ts / 2;
  return ctx.world.entities.find((e) => e.alive && e.type === type && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
}

/** The player's gold, on the HUD. */
export const goldOf = (ctx: Pick<SimCtx, 'world'>): number => Number(ctx.world.hud['gold'] ?? 0);
export function addGold(ctx: Pick<SimCtx, 'world'>, amount: number): void {
  ctx.world.hud['gold'] = goldOf(ctx) + amount;
}

/**
 * Spends energy on a job, when the game has an energy bar (the energy system puts it on the HUD): false, and nothing
 * spent, when there is not enough left. Without an energy bar every job is free.
 */
export function spendEnergy(ctx: Pick<SimCtx, 'world'>, cost: number): boolean {
  const left = ctx.world.hud['energy'];
  if (typeof left !== 'number') return true;
  if (left < cost) return false;
  ctx.world.hud['energy'] = left - cost;
  return true;
}

/** How many of something the player carries: 'seed:<crop>' for seeds, 'crop:<crop>' for produce. */
export const carried = (p: Entity, key: string): number => Number(p.props[key] ?? 0);
export function carry(p: Entity, key: string, by: number): void {
  p.props[key] = Math.max(0, carried(p, key) + by);
}
