import type { PanelSpec } from '@gg/template-core';
export const PANELS: PanelSpec[] = [
  { systemId: 'melee-attack', param: 'damage', label: 'Attack damage', min: 1, max: 10, step: 1, affects: 'levels' },
  { systemId: 'melee-attack', param: 'range', label: 'Attack range', min: 8, max: 40, step: 2, affects: 'levels' },
  { systemId: 'melee-attack', param: 'cooldownTicks', label: 'Attack cooldown (ticks)', min: 6, max: 60, step: 2, affects: 'levels' },
  { systemId: 'melee-attack', param: 'knockback', label: 'Knockback (px)', min: 0, max: 24, step: 1, affects: 'none' },
  { systemId: 'room-clear', param: 'bonus', label: 'Exit bonus', min: 0, max: 100, step: 5, affects: 'none' },
  { systemId: 'room-clear', param: 'killScore', label: 'Score per kill', min: 0, max: 50, step: 1, affects: 'none' },
];
