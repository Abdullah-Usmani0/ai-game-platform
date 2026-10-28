import Phaser from 'phaser';
import * as sim from '@gg/sdk';
import * as render from '@gg/sdk/render';
import { ENGINE_VERSION, PHASER_VERSION, SDK_VERSION } from './versions.js';

/**
 * The shared engine chunk. Every game bundle treats `phaser`, `@gg/sdk` and
 * `@gg/sdk/render` as externals resolved to these globals, so one cached file
 * serves every game on the platform.
 */
const GG = { ...sim, render, ENGINE_VERSION, PHASER_VERSION, SDK_VERSION };
declare global {
  interface Window {
    Phaser: typeof Phaser;
    GG: typeof GG;
  }
}
window.Phaser = Phaser;
window.GG = GG;
export { GG };
