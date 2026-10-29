import type { PixelCanvas } from './art/pixels.js';

/** A browser canvas holding a pixel canvas's pixels, for a texture (the art kit itself never touches the DOM). */
export function toCanvas(pc: PixelCanvas): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pc.w;
  canvas.height = pc.h;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(pc.data), pc.w, pc.h), 0, 0);
  return canvas;
}
