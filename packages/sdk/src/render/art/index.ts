/** The art kit: palettes, pixel sprites, rigged characters, the font, terrain, scenery and sound presets. No Phaser and no DOM at import time. */
export * from './audio.js';
export * from './color.js';
export * from './font.js';
export * from './palette.js';
export * from './pixels.js';
export * from './scenery.js';
export * from './sprites.js';
export * from './terrain.js';
export * from './turn.js';
export * from './designs.js';
export * from './rig/index.js';
export { THEMES, themeFor, type Layer as BackdropLayer, type Theme } from './backdrop/index.js';
export { colourDistance, quantize, tileable } from './backdrop/post.js';
