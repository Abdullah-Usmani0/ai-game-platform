import type { PanelSpec } from '@gg/template-core';

export const PANELS: PanelSpec[] = [
  { systemId: 'hazards', param: 'respawnDelayTicks', label: 'Respawn delay (ticks)', min: 0, max: 120, step: 5, affects: 'none' },
  { systemId: 'relics', param: 'relicScore', label: 'Relic score', min: 0, max: 100, step: 5, affects: 'none' },
  { systemId: 'rest', param: 'reach', label: 'Altar reach (px)', min: 2, max: 32, step: 1, affects: 'none' },
  { systemId: 'pickups', param: 'value', label: 'Soul value', min: 1, max: 100, step: 1, affects: 'none' },
  { systemId: 'goal', param: 'bonus', label: 'Region bonus', min: 0, max: 100, step: 5, affects: 'none' },
];
