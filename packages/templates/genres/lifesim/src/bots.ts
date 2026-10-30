import type { Crop } from '@gg/schemas';
import { emptyInput, MENU_GRACE_TICKS, type Entity, type InputState, type Sim } from '@gg/sdk';
import { botRandom, type BotPolicy } from '@gg/template-core';
import { packToBuy, seedToSow } from './systems/economy.js';
import { cropsOf, DAY_END_MIN, DAY_START_MIN, SHELF } from './systems/farm-kit.js';
import { farmRules, FARM_TYPES, type FarmRules } from './systems/rules.js';

/** A thing the farmer works: the tiles it covers, and the open tiles beside them to stand on, facing it. */
interface Spot {
  entity: Entity;
  stands: Array<{ at: number; fx: number; fy: number }>;
}

/** What the farmer knows of a farm that never changes: its crops, rules, walls, and where to stand for each thing. */
interface Farm {
  /** The world the spots' entities belong to: a loaded save brings a new one, and the spots are bound to it again. */
  world: Sim['world'];
  crops: readonly Crop[];
  rules: FarmRules;
  width: number;
  height: number;
  open: Uint8Array;
  plots: Spot[];
  bins: Spot[];
  shops: Spot[];
  beds: Spot[];
  /** Walking distances and first steps from the tile the player was last on. */
  from: number;
  dist: Int32Array;
  prev: Int32Array;
}

/** Each sim's farm, worked out on the first tick (a bot sees the same farm every tick of a run). */
const FARMS = new WeakMap<Sim, Farm>();

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function farmOf(sim: Sim): Farm {
  const known = FARMS.get(sim);
  if (known && known.world === sim.world) return known;
  if (known) {
    const live = new Map(sim.world.entities.map((e) => [e.id, e]));
    for (const spot of [...known.plots, ...known.bins, ...known.shops, ...known.beds]) spot.entity = live.get(spot.entity.id) ?? spot.entity;
    known.world = sim.world;
    return known;
  }
  const map = sim.map;
  const ts = map.tileSize;
  // As the sim answers it: a system the game runs has parameters, its own or none.
  const paramsOf = (id: string) => (sim.options.systems.some((s) => s.id === id) ? (sim.options.params?.[id] ?? {}) : undefined);
  const typeOf = (system: string, param: string, fallback: string) => {
    const v = paramsOf(system)?.[param];
    return typeof v === 'string' && v.length > 0 ? v : fallback;
  };
  const types = {
    plot: typeOf('farming', 'plotType', FARM_TYPES.plot),
    bin: typeOf('shipping', 'binType', FARM_TYPES.bin),
    shop: typeOf('shop', 'shopType', FARM_TYPES.shop),
    bed: typeOf('sleep', 'bedType', FARM_TYPES.bed),
  };
  const open = new Uint8Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) open[y * map.width + x] = map.kindAt(x, y) === 'solid' ? 0 : 1;
  const spotOf = (e: Entity): Spot => {
    const tiles: Array<[number, number]> = [];
    for (let y = Math.floor(e.y / ts); y < Math.ceil((e.y + e.h) / ts); y++) for (let x = Math.floor(e.x / ts); x < Math.ceil((e.x + e.w) / ts); x++) tiles.push([x, y]);
    const own = new Set(tiles.map(([x, y]) => y * map.width + x));
    const stands: Spot['stands'] = [];
    for (const [x, y] of tiles) {
      for (const [dx, dy] of STEPS) {
        const sx = x - dx;
        const sy = y - dy;
        const at = sy * map.width + sx;
        if (sx < 0 || sy < 0 || sx >= map.width || sy >= map.height || !open[at] || own.has(at)) continue;
        stands.push({ at, fx: dx, fy: dy });
      }
    }
    return { entity: e, stands };
  };
  const spots = (type: string) => sim.world.entities.filter((e) => e.alive && e.type === type).map(spotOf);
  const farm: Farm = {
    world: sim.world,
    crops: cropsOf({ content: sim.options.content ?? {} }),
    rules: farmRules(paramsOf),
    width: map.width,
    height: map.height,
    open,
    plots: spots(types.plot),
    bins: spots(types.bin),
    shops: spots(types.shop),
    beds: spots(types.bed),
    from: -1,
    dist: new Int32Array(map.width * map.height),
    prev: new Int32Array(map.width * map.height),
  };
  FARMS.set(sim, farm);
  return farm;
}

/** Breadth-first walking distances from a tile, and the tile each was reached from, over open ground. */
function walkFrom(farm: Farm, from: number): void {
  if (farm.from === from) return;
  farm.from = from;
  farm.dist.fill(-1);
  farm.prev.fill(-1);
  const queue = new Int32Array(farm.width * farm.height);
  let head = 0;
  let tail = 0;
  farm.dist[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const cur = queue[head++]!;
    const cx = cur % farm.width;
    const cy = Math.floor(cur / farm.width);
    for (const [dx, dy] of STEPS) {
      const x = cx + dx;
      const y = cy + dy;
      const at = y * farm.width + x;
      if (x < 0 || y < 0 || x >= farm.width || y >= farm.height || !farm.open[at] || farm.dist[at]! >= 0) continue;
      farm.dist[at] = farm.dist[cur]! + 1;
      farm.prev[at] = cur;
      queue[tail++] = at;
    }
  }
}

interface Job {
  kind: 'harvest' | 'water' | 'sow' | 'till' | 'buy' | 'ship' | 'sleep';
  spot: Spot;
  stand: Spot['stands'][number];
  /** The seed to have in hand (sow), or the crop to buy. */
  crop?: Crop;
}

/** Of the spots, the one with the nearest place to stand, and that place. */
function nearest(farm: Farm, spots: readonly Spot[]): { spot: Spot; stand: Spot['stands'][number] } | null {
  let best: { spot: Spot; stand: Spot['stands'][number] } | null = null;
  let bestDist = Infinity;
  for (const spot of spots) {
    for (const s of spot.stands) {
      const d = farm.dist[s.at]!;
      if (d >= 0 && d < bestDist) {
        bestDist = d;
        best = { spot, stand: s };
      }
    }
  }
  return best;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * The day's next job, by the book the season's quota is set by (economy.ts): harvest what is ripe, water what grows,
 * sow the best seed in the bag (tilling fresh soil when no tilled plot is free), buy more seeds while plots are left
 * and the purse allows, ship the bag's produce, and go to bed. Late in the day it ships and goes to bed whatever is
 * left. Null when there is nothing to do but wait for the night.
 */
function nextJob(sim: Sim, farm: Farm): Job | null {
  const w = sim.world;
  const p = w.player;
  const r = farm.rules;
  const day = Math.max(1, Math.floor(num(w.hud['day'], Number.parseInt(String(w.hud['day'] ?? '1'), 10) || 1)));
  const energy = num(w.hud['energy'], Infinity);
  const gold = num(w.hud['gold'], 0);
  const bag = (id: string) => num(p.props[`seed:${id}`], 0);
  const produce = farm.crops.some((c) => num(p.props[`crop:${c.id}`], 0) > 0);
  const job = (kind: Job['kind'], spots: readonly Spot[], crop?: Crop): Job | null => {
    const n = nearest(farm, spots);
    return n ? { kind, ...n, crop } : null;
  };
  const wrapUp = (): Job | null => (produce ? job('ship', farm.bins) : null) ?? (r.bed ? job('sleep', farm.beds) : null);

  // Late: what is left waits for tomorrow. The walk home is about nine ticks a tile, and a margin.
  const minute = num(w.hud['_minute'], DAY_START_MIN);
  const ticksLeft = ((DAY_END_MIN - minute) * r.dayLengthS * 60) / (DAY_END_MIN - DAY_START_MIN);
  const home = nearest(farm, farm.bins);
  if (ticksLeft < ((home ? farm.dist[home.stand.at]! : 0) + 40) * 9 + 120) return wrapUp();

  const crops = farm.crops;
  const cropOf = (plot: Entity) => crops.find((c) => c.id === plot.props['crop']);
  const ripe = farm.plots.filter((s) => s.entity.props['ripe'] === true);
  if (ripe.length > 0) return job('harvest', ripe);
  if (energy >= r.waterCost) {
    // A planting that can still ripen before the season ends gets its water.
    const thirsty = farm.plots.filter((s) => {
      const c = cropOf(s.entity);
      return c && s.entity.props['watered'] !== true && c.growDays - num(s.entity.props['age'], 0) <= r.days - day;
    });
    if (thirsty.length > 0) return job('water', thirsty);
  }
  const free = farm.plots.filter((s) => !cropOf(s.entity));
  const tilled = free.filter((s) => s.entity.props['tilled'] === true);
  const fresh = free.filter((s) => s.entity.props['tilled'] !== true);
  const seed = seedToSow(crops, day, r.days, bag);
  if (seed && energy >= r.waterCost) {
    if (tilled.length > 0) return job('sow', tilled, seed);
    if (fresh.length > 0 && energy >= r.tillCost + r.waterCost) return job('till', fresh);
  }
  if (r.packSize !== null && farm.shops.length > 0) {
    // Seeds only for the plots today's energy can still sow, as the book has it.
    const onTilled = r.waterCost > 0 ? Math.min(tilled.length, Math.floor(energy / r.waterCost)) : tilled.length;
    const spare = energy - onTilled * r.waterCost;
    const onFresh = r.tillCost + r.waterCost > 0 ? Math.min(fresh.length, Math.floor(spare / (r.tillCost + r.waterCost))) : fresh.length;
    const pack = packToBuy(crops.slice(0, SHELF), day, r.days, gold, r.packSize, onTilled + onFresh, bag);
    if (pack) return job('buy', farm.shops, pack);
  }
  return wrapUp();
}

/** Arrows toward a point: each axis whose offset is beyond the dead zone. */
function pressToward(input: InputState, dx: number, dy: number, dead: number): void {
  if (dx > dead) input.right = true;
  else if (dx < -dead) input.left = true;
  if (dy > dead) input.down = true;
  else if (dy < -dead) input.up = true;
}

/** A menu's answer: the seeds it came for in the shop, sleep at the bed when bedtime, the highlighted card otherwise. */
function answerMenu(sim: Sim, tick: number, mem: Record<string, number>, farm: Farm): InputState {
  const menu = sim.world.menu!;
  const input = emptyInput();
  // A key counts when it goes down: every other tick, it is let up.
  if (tick % 2 === 1) return input;
  let want = menu.selected;
  if (menu.id === 'shop') want = menu.options.findIndex((o) => o.id === farm.crops[mem['buy'] ?? -1]?.id && !o.disabled);
  else if (menu.id === 'bed') want = menu.options.findIndex((o) => o.id === (mem['bedtime'] === 1 ? 'sleep' : 'stay'));
  if (want < 0 && menu.cancellable) {
    input.dash = true;
    return input;
  }
  if (want >= 0 && menu.selected !== want) {
    input.down = true;
    return input;
  }
  input.action = tick - menu.openedTick >= MENU_GRACE_TICKS;
  return input;
}

/**
 * Farmer: the solver. Works the season by the same book its quota is set by: each day it harvests, waters, sows,
 * tills, buys seeds, ships and sleeps, walking tile by tile to stand beside each thing and face it. It answers the
 * menus itself: the shop for the seeds it came for, the bed when it is bedtime, the morning's card.
 */
export const farmer: BotPolicy = Object.assign(
  (sim: Sim, tick: number, mem: Record<string, number>): InputState => {
    const farm = farmOf(sim);
    if (sim.world.menu) return answerMenu(sim, tick, mem, farm);
    const input = emptyInput();
    const p = sim.world.player;
    if (!p.alive) return input;
    const ts = sim.map.tileSize;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const here = Math.floor(py / ts) * farm.width + Math.floor(px / ts);
    walkFrom(farm, here);
    const job = nextJob(sim, farm);
    mem['bedtime'] = job?.kind === 'sleep' ? 1 : 0;
    if (!job) return input;
    if (job.kind === 'buy') mem['buy'] = farm.crops.indexOf(job.crop!);
    const sx = job.stand.at % farm.width;
    const sy = Math.floor(job.stand.at / farm.width);
    const cx = (sx + 0.5) * ts;
    const cy = (sy + 0.5) * ts;
    const settled = here === job.stand.at && Math.abs(px - cx) <= 2 && Math.abs(py - cy) <= 2 && Math.abs(p.vx) < 30 && Math.abs(p.vy) < 30;
    if (!settled) {
      mem['phase'] = 0;
      // Waypoints tile by tile, each kept until the player is near its middle, so corners are never cut.
      const reached = (mem['wx'] ?? -1) < 0 || (Math.abs((mem['wx']! + 0.5) * ts - px) < 2 && Math.abs((mem['wy']! + 0.5) * ts - py) < 2);
      if (reached || mem['goal'] !== job.stand.at) {
        let step = job.stand.at;
        while (farm.prev[step]! >= 0 && farm.prev[step] !== here) step = farm.prev[step]!;
        mem['wx'] = step % farm.width;
        mem['wy'] = Math.floor(step / farm.width);
        mem['goal'] = job.stand.at;
      }
      pressToward(input, (mem['wx']! + 0.5) * ts - px, (mem['wy']! + 0.5) * ts - py, 0.5);
      return input;
    }
    mem['wx'] = -1;
    // The seed in hand first: jump moves on to the next seed in the bag.
    if (job.kind === 'sow' && p.props['seed'] !== job.crop!.id) {
      input.jump = tick % 2 === 0;
      return input;
    }
    // Face the thing (unless already facing it), work it, let the key up.
    const tx = sx + job.stand.fx;
    const ty = sy + job.stand.fy;
    const facing = p.props['targetTx'] === tx && p.props['targetTy'] === ty;
    const phase = mem['phase'] ?? 0;
    if (phase === 0 && !facing) {
      pressToward(input, job.stand.fx, job.stand.fy, 0);
      mem['phase'] = 1;
    } else if (phase <= 1) {
      input.action = true;
      mem['phase'] = 2;
    } else mem['phase'] = 0;
    return input;
  },
  { menus: true },
);

export const afk: BotPolicy = () => emptyInput();

/** Wanders, works whatever it faces and flips through its seeds at random: it must never make a season's quota. */
export const chaos: BotPolicy = (sim: Sim, tick, mem) => {
  const input = emptyInput();
  if (tick % 15 === 0) {
    const rnd = botRandom(sim, mem);
    mem['dx'] = rnd.int(3) - 1;
    mem['dy'] = rnd.int(3) - 1;
  }
  if ((mem['dx'] ?? 0) > 0) input.right = true;
  if ((mem['dx'] ?? 0) < 0) input.left = true;
  if ((mem['dy'] ?? 0) > 0) input.down = true;
  if ((mem['dy'] ?? 0) < 0) input.up = true;
  if (tick % 7 === 0) input.action = true;
  if (tick % 41 === 0) input.jump = true;
  return input;
};

export const BOTS: Record<string, BotPolicy> = { farmer, afk, chaos };
