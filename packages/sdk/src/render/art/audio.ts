/**
 * Procedural sound effects (no files): square, triangle, sawtooth and filtered-noise voices with pitch sweeps and short
 * envelopes, one preset per gameplay event. The presets are data; render/sfx.ts plays them through WebAudio.
 */

export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';
export interface Voice {
  wave: Wave;
  /** Start and end frequency in Hz (for noise, the low-pass cutoff). */
  from: number;
  to: number;
  dur: number;
  vol: number;
  delay?: number;
}

const arp = (notes: number[], step: number, dur: number, vol: number, wave: Wave = 'square'): Voice[] => notes.map((f, i) => ({ wave, from: f, to: f, dur, vol, delay: i * step }));

export const SFX_PRESETS: Readonly<Record<string, readonly Voice[]>> = {
  jump: [{ wave: 'square', from: 300, to: 620, dur: 0.11, vol: 0.13 }],
  land: [{ wave: 'noise', from: 700, to: 160, dur: 0.06, vol: 0.12 }],
  dash: [{ wave: 'noise', from: 3000, to: 500, dur: 0.16, vol: 0.13 }],
  pickup: arp([988, 1319], 0.055, 0.08, 0.1),
  hit: [
    { wave: 'noise', from: 3200, to: 400, dur: 0.08, vol: 0.16 },
    { wave: 'square', from: 220, to: 90, dur: 0.09, vol: 0.09 },
  ],
  damage: [{ wave: 'sawtooth', from: 280, to: 70, dur: 0.24, vol: 0.13 }],
  death: [
    { wave: 'square', from: 440, to: 50, dur: 0.55, vol: 0.13 },
    { wave: 'noise', from: 1400, to: 90, dur: 0.45, vol: 0.1 },
  ],
  enemyDeath: [{ wave: 'noise', from: 2000, to: 140, dur: 0.2, vol: 0.12 }],
  shoot: [{ wave: 'square', from: 1100, to: 330, dur: 0.06, vol: 0.05 }],
  swing: [{ wave: 'noise', from: 4200, to: 900, dur: 0.1, vol: 0.1 }],
  push: [{ wave: 'triangle', from: 140, to: 80, dur: 0.12, vol: 0.18 }],
  move: [{ wave: 'triangle', from: 640, to: 600, dur: 0.025, vol: 0.04 }],
  undo: [{ wave: 'square', from: 520, to: 300, dur: 0.07, vol: 0.06 }],
  bump: [{ wave: 'triangle', from: 95, to: 70, dur: 0.06, vol: 0.12 }],
  door: [
    { wave: 'triangle', from: 150, to: 55, dur: 0.32, vol: 0.18 },
    { wave: 'noise', from: 1200, to: 140, dur: 0.28, vol: 0.09 },
    { wave: 'square', from: 880, to: 880, dur: 0.05, vol: 0.05, delay: 0.02 },
  ],
  checkpoint: arp([659, 988], 0.08, 0.12, 0.09, 'triangle'),
  level_start: arp([523, 784], 0.07, 0.1, 0.07, 'triangle'),
  level_complete: arp([523, 659, 784, 1047], 0.09, 0.16, 0.1),
  select: [{ wave: 'square', from: 660, to: 660, dur: 0.04, vol: 0.06 }],
  // A finisher: the hit, a heavier crunch and a low thump under it.
  finisher: [
    { wave: 'noise', from: 2600, to: 220, dur: 0.14, vol: 0.18 },
    { wave: 'square', from: 180, to: 55, dur: 0.16, vol: 0.12 },
    { wave: 'triangle', from: 90, to: 40, dur: 0.2, vol: 0.2 },
  ],
  // A boss slam: a deep boom with rubble.
  slam: [
    { wave: 'triangle', from: 110, to: 32, dur: 0.42, vol: 0.24 },
    { wave: 'noise', from: 900, to: 80, dur: 0.38, vol: 0.14 },
  ],
  // A boss's roar as it enrages: a falling sawtooth growl over noise.
  roar: [
    { wave: 'sawtooth', from: 220, to: 70, dur: 0.6, vol: 0.12 },
    { wave: 'sawtooth', from: 165, to: 52, dur: 0.6, vol: 0.08, delay: 0.03 },
    { wave: 'noise', from: 1500, to: 200, dur: 0.5, vol: 0.08 },
  ],
  menu_open: arp([392, 523, 659, 784], 0.05, 0.14, 0.07, 'triangle'),
  menu_pick: [...arp([784, 1047, 1568], 0.045, 0.12, 0.09), { wave: 'noise', from: 6000, to: 2000, dur: 0.12, vol: 0.04 }],
  // The farm: a hoe biting the soil, a seed pressed in, the watering can, a crop pulled up, the bin's lid, coins.
  dig: [
    { wave: 'noise', from: 900, to: 200, dur: 0.09, vol: 0.12 },
    { wave: 'triangle', from: 160, to: 90, dur: 0.07, vol: 0.1 },
  ],
  sow: [{ wave: 'triangle', from: 520, to: 700, dur: 0.05, vol: 0.07 }],
  splash: [
    { wave: 'noise', from: 4000, to: 1200, dur: 0.18, vol: 0.07 },
    { wave: 'noise', from: 1800, to: 600, dur: 0.14, vol: 0.05, delay: 0.05 },
  ],
  pluck: [{ wave: 'square', from: 660, to: 990, dur: 0.06, vol: 0.08 }, ...arp([1319, 1760], 0.05, 0.08, 0.06).map((v) => ({ ...v, delay: (v.delay ?? 0) + 0.05 }))],
  thunk: [{ wave: 'triangle', from: 150, to: 90, dur: 0.1, vol: 0.16 }, ...arp([1047, 1319], 0.05, 0.08, 0.06).map((v) => ({ ...v, delay: (v.delay ?? 0) + 0.08 }))],
  coins: arp([988, 1319, 1568], 0.06, 0.09, 0.08),
  // The day's turns: a falling lullaby to bed, a rising phrase for the morning, two low notes as evening comes.
  lullaby: arp([784, 659, 523, 392], 0.16, 0.3, 0.06, 'triangle'),
  morning: arp([523, 659, 784, 1047], 0.1, 0.22, 0.06, 'triangle'),
  dusk: arp([440, 392], 0.2, 0.4, 0.05, 'triangle'),
  sigh: [{ wave: 'triangle', from: 330, to: 180, dur: 0.35, vol: 0.08 }],
  wilt: arp([392, 349, 330, 262], 0.18, 0.3, 0.08, 'triangle'),
};

/** What each gameplay event sounds like (the feedback table decides whether it sounds at all). */
export function sfxFor(event: string, payload: Record<string, unknown>, isPlayer: (id: unknown) => boolean): string | null {
  switch (event) {
    case 'death':
      return isPlayer(payload['entity']) ? 'death' : 'enemyDeath';
    case 'damage':
      return isPlayer(payload['target']) ? 'damage' : null;
    case 'custom:fire':
      return 'shoot';
    case 'custom:swing':
      return 'swing';
    case 'custom:bump':
      return 'bump';
    case 'custom:door_open':
      return 'door';
    case 'custom:finisher':
      return 'finisher';
    case 'custom:slam':
      return 'slam';
    case 'custom:enrage':
      return 'roar';
    case 'custom:till':
      return 'dig';
    case 'custom:plant':
      return 'sow';
    case 'custom:water':
      return 'splash';
    case 'custom:harvest':
      return 'pluck';
    case 'custom:ship':
      return 'thunk';
    case 'custom:payout':
    case 'custom:buy':
      return 'coins';
    case 'custom:sleep':
      return 'lullaby';
    case 'custom:day_start':
      return 'morning';
    case 'custom:dusk':
      return 'dusk';
    case 'custom:exhausted':
      return 'sigh';
    case 'custom:season_over':
      return 'wilt';
    case 'custom:no_seeds':
    case 'custom:too_tired':
    case 'custom:bin_empty':
      return 'bump';
    default:
      return SFX_PRESETS[event] ? event : null;
  }
}

/**
 * The sound an event can play at all, whoever it happens to (the player's death or an enemy's), or null when the
 * renderer has none: a feedback binding to sfx for such an event would be silent.
 */
export function sfxPresetFor(event: string): string | null {
  return sfxFor(event, { entity: 0, target: 0 }, () => true) ?? sfxFor(event, { entity: 1, target: 1 }, () => false);
}
