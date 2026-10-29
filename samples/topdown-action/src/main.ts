import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-topdown-action', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#1a1210', mid: '#4a3328', foreground: '#f5e6c8', accent: '#ff9f43', danger: '#e63946', ui: '#ffffff' },
    camera: { lerp: 0.14, maxShake: 0.6, deadzone: { w: 40, h: 28 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 10, effects: 15 },
    genre: 'topdown-action',
    title: 'Ember Halls',
  },
  parent: 'game',
  defaultSeed: 1,
});
