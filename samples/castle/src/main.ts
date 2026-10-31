import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-castle', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 480, h: 270 },
    pixelArt: true,
    palette: { background: '#0d0a12', mid: '#3b3346', foreground: '#e8dcc8', accent: '#d9a441', danger: '#a3172a', ui: '#efe6d2' },
    camera: { lerp: 0.12, maxShake: 0.5, deadzone: { w: 48, h: 24 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 12, effects: 15 },
    genre: 'castle',
    title: 'The Salt Chapel',
  },
  parent: 'game',
  defaultSeed: 1,
});
