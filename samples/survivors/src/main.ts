import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-survivors', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#14101c', mid: '#3d3550', foreground: '#f6f1d1', accent: '#8bd3dd', danger: '#f26b5b', ui: '#ffffff' },
    camera: { lerp: 0.15, maxShake: 0.6, deadzone: { w: 32, h: 24 } },
  },
  parent: 'game',
  defaultSeed: 1,
});
