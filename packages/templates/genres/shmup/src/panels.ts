import type { PanelSpec } from '@gg/template-core';
export const PANELS: PanelSpec[] = [
  { systemId: 'player-shooter', param: 'fireCooldownTicks', label: 'Fire cooldown (ticks)', min: 4, max: 30, step: 1, affects: 'levels' },
  { systemId: 'player-shooter', param: 'damage', label: 'Shot damage', min: 1, max: 5, step: 1, affects: 'levels' },
  { systemId: 'player-shooter', param: 'spread', label: 'Spread (shots)', min: 1, max: 3, step: 1, affects: 'levels' },
  { systemId: 'player-shooter', param: 'shotSpeed', label: 'Shot speed', min: 80, max: 400, step: 10, affects: 'none' },
  { systemId: 'spawner', param: 'maxAlive', label: 'Max enemies alive', min: 10, max: 200, step: 10, affects: 'none' },
  { systemId: 'survival', param: 'winAtS', label: 'Run length (s)', min: 20, max: 900, step: 10, affects: 'levels' },
];
