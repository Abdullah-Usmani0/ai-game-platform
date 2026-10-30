import type { ParamValue } from '@gg/schemas';
import type { SimCtx } from '@gg/sdk';

/** The defaults of the farm's parameters, one place for the systems, their catalog entries and the economy. */
export const FARM_DEFAULTS = {
  dayLengthS: 120,
  days: 7,
  share: 0.6,
  startGold: 100,
  starterSeeds: 6,
  tillCost: 2,
  waterCost: 1,
  packSize: 5,
  maxEnergy: 60,
} as const;

/** The rules of a farm that decide what a season can earn, from the game's systems and their parameters. */
export interface FarmRules {
  /** Days in the season. */
  days: number;
  /** Seconds a day lasts, six in the morning to two at night. */
  dayLengthS: number;
  /** The share of an ideal farmer's earnings a season's quota asks for, at middling difficulty. */
  share: number;
  startGold: number;
  /** Seeds of the first crop the farmer starts with. */
  starterSeeds: number;
  /** Seeds in a pack at the shop, or null when the game has no shop: only the starter seeds get sown. */
  packSize: number | null;
  /** The day's energy, or null when the game has no energy bar and every job is free. */
  maxEnergy: number | null;
  tillCost: number;
  waterCost: number;
  /** Whether the farmer can end the day in bed; without one it falls asleep at two and wakes on half its energy. */
  bed: boolean;
}

/**
 * A farm's rules from the parameters of the game's systems (each system's own, or its defaults). A system the game
 * leaves out has no part: no shop, no seeds to buy; no energy bar, free work; no bed, nights fallen asleep in the field.
 */
export function farmRules(paramsOf: (systemId: string) => Readonly<Record<string, ParamValue>> | undefined): FarmRules {
  const num = (id: string, key: string, fallback: number): number => {
    const v = paramsOf(id)?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  const whole = (id: string, key: keyof typeof FARM_DEFAULTS, min: number) => Math.max(min, Math.round(num(id, key, FARM_DEFAULTS[key])));
  return {
    days: whole('season', 'days', 1),
    dayLengthS: Math.max(10, num('day-clock', 'dayLengthS', FARM_DEFAULTS.dayLengthS)),
    share: Math.max(0.05, num('season', 'share', FARM_DEFAULTS.share)),
    startGold: whole('season', 'startGold', 0),
    starterSeeds: whole('farming', 'starterSeeds', 0),
    packSize: paramsOf('shop') ? whole('shop', 'packSize', 1) : null,
    maxEnergy: paramsOf('energy') ? whole('energy', 'maxEnergy', 1) : null,
    tillCost: Math.max(0, num('farming', 'tillCost', FARM_DEFAULTS.tillCost)),
    waterCost: Math.max(0, num('farming', 'waterCost', FARM_DEFAULTS.waterCost)),
    bed: paramsOf('sleep') !== undefined,
  };
}

/** The farm's rules as a system sees them. */
export const farmRulesOf = (ctx: Pick<SimCtx, 'paramsOf'>): FarmRules => farmRules((id) => ctx.paramsOf(id));

/** The entity types the farm's systems work with, by role; a composed game names its own (composed parameters). */
export const FARM_TYPES = { plot: 'plot', crop: 'crop', bin: 'bin', shop: 'shop', bed: 'bed' } as const;

/** A system's name for one of the farm's types: its composed parameter, else the shipped name. */
export function typeParam(ctx: Pick<SimCtx, 'params'>, param: string, fallback: string): string {
  const v = ctx.params[param];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}
