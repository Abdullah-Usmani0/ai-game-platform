import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-lifesim', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#1d2b1f', mid: '#6b8e4e', foreground: '#f2d7b6', accent: '#f0b84a', danger: '#d9534f', ui: '#f5eedc' },
    camera: { lerp: 0.15, maxShake: 0.1, deadzone: { w: 120, h: 80 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 8, effects: 12 },
    genre: 'lifesim',
    title: 'Willowbrook Farm',
  },
  parent: 'game',
  defaultSeed: 1,
});
