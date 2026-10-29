import { createGame } from '@gg/sdk/render';
import { LEVELS, SIM_OPTIONS } from './game.js';

void createGame({
  levels: LEVELS,
  sim: SIM_OPTIONS,
  build: { gameId: 'sample-platformer', versionId: 'dev', engine: 'phaser-4.2.1/sdk-0.1.0' },
  style: {
    canvas: { w: 320, h: 180 },
    pixelArt: true,
    palette: { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff' },
    camera: { lerp: 0.12, maxShake: 0.5, deadzone: { w: 48, h: 24 } },
    outline: 'dark',
    postFx: { vignette: true, bloom: true, crt: false },
    animationFps: { character: 10, effects: 15 },
    genre: 'platformer',
    title: 'First Steps',
  },
  parent: 'game',
  defaultSeed: 1,
});
