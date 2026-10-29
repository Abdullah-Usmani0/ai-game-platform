import type { PanelSpec } from '@gg/template-core';

/** Board pacing is all the player tunes: how fast a step slides and how held keys repeat. */
export const PANELS: PanelSpec[] = [
  { systemId: 'grid-push', param: 'stepTicks', label: 'Step slide (ticks)', min: 2, max: 20, step: 1, affects: 'none' },
  { systemId: 'grid-push', param: 'repeatDelayTicks', label: 'Hold-to-repeat delay (ticks)', min: 4, max: 60, step: 2, affects: 'none' },
  { systemId: 'grid-push', param: 'repeatTicks', label: 'Repeat every (ticks)', min: 2, max: 30, step: 1, affects: 'none' },
  { systemId: 'grid-push', param: 'bonus', label: 'Solve bonus', min: 0, max: 100, step: 5, affects: 'none' },
];
