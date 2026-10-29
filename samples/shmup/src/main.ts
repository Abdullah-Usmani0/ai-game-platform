import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-shmup', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#0b1026', mid: '#263a6b', foreground: '#eaf2ff', accent: '#5ee0ff', danger: '#ff4d6d', ui: '#ffffff' },
    camera: { lerp: 0.2, maxShake: 0.4, deadzone: { w: 0, h: 0 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 10, effects: 15 },
    genre: 'shmup',
    title: 'Static Sky',
  },
  parent: 'game',
  defaultSeed: 1,
});
