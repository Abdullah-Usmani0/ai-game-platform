import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-metroidvania', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#0d0b16', mid: '#3b3552', foreground: '#f2e9d8', accent: '#ffc857', danger: '#e4572e', ui: '#9ad1d4' },
    camera: { lerp: 0.15, maxShake: 0.5, deadzone: { w: 24, h: 16 } },
  },
  parent: 'game',
  defaultSeed: 1,
});
