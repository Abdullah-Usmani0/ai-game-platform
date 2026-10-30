import type { Crop } from '@gg/schemas';
import { defineSystem, type Entity, type SimCtx } from '@gg/sdk';
import { carried, carry, cropsOf, entityAt, facedTile, facingStart, spendEnergy, track, type Facing } from './farm-kit.js';
import { FARM_DEFAULTS, FARM_TYPES, typeParam } from './rules.js';

interface FarmingState {
  facing: Facing;
  /** The crop whose seeds the player sows: an index into the game's crops. */
  sel: number;
}

const STAGES = ['seed', 'sprout', 'grown', 'ripe'] as const;

/** How far along a planting is: just sown, a sprout until half its nights, then grown, then ripe. */
export function stageOf(crop: Pick<Crop, 'growDays'>, age: number, ripe: boolean): (typeof STAGES)[number] {
  if (ripe) return 'ripe';
  if (age <= 0) return 'seed';
  return age * 2 < crop.growDays ? 'sprout' : 'grown';
}

const cropOn = (ctx: SimCtx, plot: Entity): Entity | undefined => ctx.world.entities.find((e) => e.alive && e.id === plot.props['cropEntity']);

/** A plot's look follows its soil: untilled, tilled and dry, or tilled and watered. */
function dress(ctx: SimCtx, plot: Entity, crops: readonly Crop[]): void {
  plot.anim = plot.props['watered'] === true ? 'watered' : plot.props['tilled'] === true ? 'tilled' : 'soil';
  const crop = crops.find((c) => c.id === plot.props['crop']);
  const plant = cropOn(ctx, plot);
  if (!crop || !plant) return;
  plant.anim = stageOf(crop, Number(plot.props['age'] ?? 0), plot.props['ripe'] === true);
  plant.props['stage'] = STAGES.indexOf(plant.anim as (typeof STAGES)[number]);
}

function show(s: FarmingState, ctx: SimCtx, crops: readonly Crop[]): void {
  const crop = crops[s.sel % crops.length]!;
  ctx.world.hud['seeds'] = `${crop.name} ${carried(ctx.world.player, `seed:${crop.id}`)}`;
  // The seed in hand, for bots and the view.
  ctx.world.player.props['seed'] = crop.id;
}

/**
 * Soil and crops. The action key works the plot the player faces: an untilled plot is tilled, tilled soil is sown with
 * the chosen seed, a planting is watered once a day, a ripe crop is harvested into the bag (a pickup of its crop type).
 * Jump changes the seed to sow. Overnight every watered planting grows a day and the soil dries; a crop that bears again
 * starts over a few nights before ripe. Tilling and watering spend energy when the game has an energy bar.
 */
export const farming = defineSystem<FarmingState>({
  id: 'farming',
  init(ctx) {
    const crops = cropsOf(ctx);
    const p = ctx.world.player;
    // Every season starts fresh: what the bag held when the last one was won stays behind (the player's props carry
    // from level to level), and the farmer sets out with the starter seeds.
    for (const c of crops) for (const key of [`seed:${c.id}`, `crop:${c.id}`]) if (carried(p, key) > 0) p.props[key] = 0;
    const starter = Math.max(0, Math.round(Number(ctx.params['starterSeeds'] ?? FARM_DEFAULTS.starterSeeds)));
    if (starter > 0) carry(p, `seed:${crops[0]!.id}`, starter);
    const plotType = typeParam(ctx, 'plotType', FARM_TYPES.plot);
    for (const plot of ctx.world.entities) if (plot.type === plotType) dress(ctx, plot, crops);
    const s: FarmingState = { facing: facingStart(), sel: 0 };
    show(s, ctx, crops);
    return s;
  },
  fixedUpdate(s, input, ctx) {
    const p = ctx.world.player;
    if (!p.alive) return;
    const crops = cropsOf(ctx);
    const pressed = track(s.facing, input, ctx.tick, true);
    const { tx, ty } = facedTile(ctx, s.facing);
    // Where the next job would land, for the view's cursor.
    p.props['targetTx'] = tx;
    p.props['targetTy'] = ty;
    if (pressed.jump) {
      // The next crop the player has seeds of, or simply the next one when it has none.
      const has = crops.map((c) => carried(p, `seed:${c.id}`) > 0);
      let next = (s.sel + 1) % crops.length;
      for (let i = 1; i <= crops.length; i++) {
        const k = (s.sel + i) % crops.length;
        if (has[k]) {
          next = k;
          break;
        }
      }
      s.sel = next;
      ctx.emit('custom:seed_pick', { crop: crops[s.sel]!.id });
    }
    show(s, ctx, crops);
    if (!pressed.action) return;
    const plot = entityAt(ctx, typeParam(ctx, 'plotType', FARM_TYPES.plot), tx, ty);
    if (!plot) return;
    // Where it happens, as every top-down event says it: the top-left of the thing (the view centres its effects on it).
    const at = { x: plot.x, y: plot.y };
    const crop = crops.find((c) => c.id === plot.props['crop']);
    if (crop && plot.props['ripe'] === true) {
      carry(p, `crop:${crop.id}`, 1);
      ctx.emit('pickup', { entity: plot.id, type: crop.id });
      ctx.emit('custom:harvest', { crop: crop.id, color: crop.look.color, ...at });
      if (crop.regrowDays !== undefined) {
        plot.props['age'] = Math.max(0, crop.growDays - crop.regrowDays);
        plot.props['ripe'] = false;
      } else {
        const plant = cropOn(ctx, plot);
        if (plant) {
          plant.alive = false;
          ctx.emit('despawn', { entity: plant.id, type: plant.type });
        }
        plot.props['crop'] = '';
        plot.props['cropEntity'] = -1;
        plot.props['age'] = 0;
        plot.props['ripe'] = false;
      }
    } else if (crop && plot.props['watered'] !== true) {
      if (!spendEnergy(ctx, Number(ctx.params['waterCost'] ?? FARM_DEFAULTS.waterCost))) {
        ctx.emit('custom:too_tired', at);
        return;
      }
      plot.props['watered'] = true;
      ctx.emit('custom:water', at);
    } else if (!crop && plot.props['tilled'] === true) {
      const seed = crops[s.sel % crops.length]!;
      if (carried(p, `seed:${seed.id}`) <= 0) {
        ctx.emit('custom:no_seeds', { crop: seed.id, ...at });
        return;
      }
      carry(p, `seed:${seed.id}`, -1);
      const plant = ctx.spawn(typeParam(ctx, 'cropType', FARM_TYPES.crop), plot.x, plot.y);
      plant.props['crop'] = seed.id;
      plant.props['shape'] = seed.look.shape;
      plant.props['color'] = seed.look.color;
      plot.props['crop'] = seed.id;
      plot.props['cropEntity'] = plant.id;
      plot.props['age'] = 0;
      plot.props['ripe'] = false;
      ctx.emit('custom:plant', { crop: seed.id, ...at });
      show(s, ctx, crops);
    } else if (plot.props['tilled'] !== true) {
      if (!spendEnergy(ctx, Number(ctx.params['tillCost'] ?? FARM_DEFAULTS.tillCost))) {
        ctx.emit('custom:too_tired', at);
        return;
      }
      plot.props['tilled'] = true;
      ctx.emit('custom:till', at);
    } else return;
    dress(ctx, plot, crops);
  },
  onEvent(_s, ev, ctx) {
    if (ev.name !== 'custom:day_end') return;
    const crops = cropsOf(ctx);
    const plotType = typeParam(ctx, 'plotType', FARM_TYPES.plot);
    for (const plot of ctx.world.entities) {
      if (plot.type !== plotType || !plot.alive) continue;
      const crop = crops.find((c) => c.id === plot.props['crop']);
      if (crop && plot.props['watered'] === true && plot.props['ripe'] !== true) {
        const age = Number(plot.props['age'] ?? 0) + 1;
        plot.props['age'] = age;
        if (age >= crop.growDays) plot.props['ripe'] = true;
      }
      plot.props['watered'] = false;
      dress(ctx, plot, crops);
    }
  },
});

export const meta = {
  id: 'farming',
  genres: ['lifesim'],
  required: true,
  summary: 'Soil plots and crops: till, sow the chosen seed, water once a day, harvest ripe crops; watered plantings grow overnight.',
  params: {
    starterSeeds: { type: 'number', min: 0, max: 30, default: FARM_DEFAULTS.starterSeeds, affects: 'levels' },
    tillCost: { type: 'number', min: 0, max: 10, default: FARM_DEFAULTS.tillCost, affects: 'levels' },
    waterCost: { type: 'number', min: 0, max: 10, default: FARM_DEFAULTS.waterCost, affects: 'levels' },
    plotType: { type: 'string', default: FARM_TYPES.plot, affects: 'none', composed: 'entity' },
    cropType: { type: 'string', default: FARM_TYPES.crop, affects: 'none', composed: 'entity' },
  },
  emits: ['pickup', 'despawn', 'spawn', 'custom:till', 'custom:plant', 'custom:water', 'custom:harvest', 'custom:seed_pick', 'custom:no_seeds', 'custom:too_tired'],
  feedbackFor: ['pickup', 'custom:till', 'custom:plant', 'custom:water', 'custom:harvest', 'custom:no_seeds', 'custom:too_tired'],
  controls: { left: 'face', right: 'face', up: 'face', down: 'face', action: 'work', jump: 'choose seed' },
  provides: { spawns: ['crop'] },
  requires: { movement: ['topdown'], roles: ['plot'], systems: ['day-clock'] },
} as const;
