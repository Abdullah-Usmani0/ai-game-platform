import { PixelCanvas } from '@gg/sdk/art';
import { describe, expect, it } from 'vitest';
import { checkBackdrop, finishImage, measureBackdrop, PROCEDURAL, quantize, THEMES, tileable, toGrid, type ImageProvider, type ImageRequest } from './index.js';

const W = 240;
const H = 135;
const req = (theme: string, layer: 'far' | 'mid' | 'near'): ImageRequest => ({ key: `${theme}-${layer}`, kind: 'backdrop', prompt: '', negative: [], theme, layer, w: W, h: H, seed: 7 });

describe('the procedural painter', () => {
  it('paints the same layers every time, the far one opaque, the nearer ones partly clear', async () => {
    for (const theme of Object.keys(THEMES)) {
      const a = await PROCEDURAL.generate(req(theme, 'far'));
      const b = await PROCEDURAL.generate(req(theme, 'far'));
      expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data)), theme).toBe(true);
      expect(measureBackdrop(a.image, THEMES[theme]!.palette).clear, theme).toBe(0);
      const mid = await PROCEDURAL.generate(req(theme, 'mid'));
      expect(measureBackdrop(mid.image, THEMES[theme]!.palette).clear, theme).toBeGreaterThan(0.2);
    }
  });

  it('gives finished layers that pass the backdrop QA in every theme', async () => {
    for (const [id, theme] of Object.entries(THEMES)) {
      for (const layer of ['far', 'mid', 'near'] as const) {
        const done = await finishImage(req(id, layer), theme.palette, []);
        expect(done.issues, `${id} ${layer}`).toEqual([]);
        expect(done.image.w).toBe(W);
      }
    }
  });
});

describe('putting an image on the game grid and palette', () => {
  it('quantises every pixel to the palette', () => {
    const src = new PixelCanvas(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) src.set(x, y, [x * 30, y * 30, 90]);
    const palette = [[0, 0, 0], [255, 255, 255], [200, 40, 40]] as const;
    const out = quantize(src, palette, 1);
    expect(measureBackdrop(out, palette).offPalette).toBe(0);
  });

  it('brings an image drawn at twice the size back to the grid', () => {
    const small = THEMES['gothic']!.layers.far(60, 34, 3);
    const big = new PixelCanvas(120, 68);
    big.blitScaled(small, 0, 0, 2);
    expect(Buffer.from(toGrid(big, 60, 34).data).equals(Buffer.from(small.data))).toBe(true);
  });

  it('makes a layer wrap', () => {
    const wide = THEMES['coral']!.layers.far(W + 24, H, 5);
    const raw = new PixelCanvas(W, H);
    raw.blit(wide, 0, 0);
    expect(measureBackdrop(tileable(wide, 24), THEMES['coral']!.palette).seam).toBeLessThan(measureBackdrop(raw, THEMES['coral']!.palette).seam);
  });
});

describe('backdrop QA', () => {
  it('flags pixels off the palette, an image scaled up from a coarser grid, and a far layer with holes', () => {
    const palette = THEMES['gothic']!.palette;
    const far = THEMES['gothic']!.layers.far(W, H, 7);
    const off = new PixelCanvas(W, H);
    off.data.set(far.data);
    off.set(3, 3, [1, 2, 3]);
    off.clear(10, 10);
    const codes = checkBackdrop(off, { palette, layer: 'far', tiles: false }).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['backdrop_palette', 'backdrop_clear']));
    const coarse = new PixelCanvas(W, H);
    coarse.blitScaled(THEMES['gothic']!.layers.far(W / 2, Math.ceil(H / 2), 7), 0, 0, 2);
    expect(checkBackdrop(coarse, { palette, layer: 'far', tiles: false }).issues.map((i) => i.code)).toContain('backdrop_pixel_size');
  });

  it('falls back to the painter when a provider fails or its image does not pass', async () => {
    const broken: ImageProvider = { name: 'broken', generate: () => Promise.reject(new Error('no key')) };
    const blurry: ImageProvider = {
      name: 'blurry',
      generate: (r) => {
        const img = new PixelCanvas(r.w + 24, r.h);
        img.fillRect(0, 0, img.w, img.h, [128, 128, 128]);
        return Promise.resolve({ image: img, provider: 'blurry', model: 'x', costUsd: 0.01 });
      },
    };
    const done = await finishImage(req('frost', 'far'), THEMES['frost']!.palette, [broken, blurry]);
    expect(done.provider).toBe('procedural');
    expect(done.costUsd).toBeCloseTo(0.01);
    expect(done.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['provider_failed', 'backdrop_pixel_size']));
  });
});
