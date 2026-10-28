import type { PanelSpec } from '@gg/template-core';
export const PANELS: PanelSpec[] = [
  { systemId: 'auto-attack', param: 'range', label: 'Attack range', min: 16, max: 160, step: 4, affects: 'levels' },
  { systemId: 'auto-attack', param: 'damage', label: 'Attack damage', min: 1, max: 20, step: 1, affects: 'levels' },
  { systemId: 'auto-attack', param: 'cooldownTicks', label: 'Attack cooldown (ticks)', min: 5, max: 120, step: 5, affects: 'levels' },
  { systemId: 'auto-attack', param: 'xpPerLevel', label: 'XP per level', min: 2, max: 50, step: 1, affects: 'levels' },
  { systemId: 'spawner', param: 'maxAlive', label: 'Max enemies alive', min: 10, max: 200, step: 10, affects: 'none' },
  { systemId: 'survival', param: 'winAtS', label: 'Run length (s)', min: 20, max: 900, step: 10, affects: 'levels' },
];
