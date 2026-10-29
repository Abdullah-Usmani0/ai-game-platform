import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-puzzle', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#17130f', mid: '#5a4632', foreground: '#f3e3c3', accent: '#d9822b', danger: '#c0392b', ui: '#7bd389' },
    camera: { lerp: 0.2, maxShake: 0.2, deadzone: { w: 120, h: 80 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 10, effects: 15 },
    genre: 'puzzle',
    title: 'Crate Cellar',
  },
  parent: 'game',
  defaultSeed: 1,
});
