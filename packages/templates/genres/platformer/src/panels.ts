import type { PanelSpec } from '@gg/template-core';

export const PANELS: PanelSpec[] = [
  { systemId: 'hazards', param: 'respawnDelayTicks', label: 'Respawn delay (ticks)', min: 0, max: 120, step: 5, affects: 'none' },
  { systemId: 'combat-stomp', param: 'bounceVy', label: 'Stomp bounce', min: -200, max: -20, step: 5, affects: 'none' },
  { systemId: 'combat-stomp', param: 'stompScore', label: 'Stomp score', min: 0, max: 50, step: 1, affects: 'none' },
  { systemId: 'pickups', param: 'value', label: 'Coin value', min: 1, max: 100, step: 1, affects: 'none' },
  { systemId: 'goal', param: 'bonus', label: 'Level bonus', min: 0, max: 100, step: 5, affects: 'none' },
];
