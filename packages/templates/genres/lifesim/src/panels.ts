import type { PanelSpec } from '@gg/template-core';
export const PANELS: PanelSpec[] = [
  { systemId: 'day-clock', param: 'dayLengthS', label: 'Day length (s)', min: 30, max: 600, step: 10, affects: 'levels' },
  { systemId: 'season', param: 'days', label: 'Days in a season', min: 3, max: 28, step: 1, affects: 'levels' },
  { systemId: 'season', param: 'share', label: "Quota (share of an ideal season's earnings)", min: 0.1, max: 0.9, step: 0.05, affects: 'levels' },
  { systemId: 'season', param: 'startGold', label: 'Starting gold', min: 0, max: 1000, step: 10, affects: 'levels' },
  { systemId: 'farming', param: 'starterSeeds', label: 'Starter seeds', min: 0, max: 30, step: 1, affects: 'levels' },
  { systemId: 'shop', param: 'packSize', label: 'Seeds per pack', min: 1, max: 10, step: 1, affects: 'levels' },
  { systemId: 'energy', param: 'maxEnergy', label: 'Energy per day', min: 10, max: 300, step: 5, affects: 'levels' },
];
