import type { PixelCanvas, RGB } from '@gg/sdk/art';
import { THEMES, type Layer } from './painter.js';
import { quantize, tileable, toGrid } from './post.js';
import { checkBackdrop, type BackdropIssue } from './qa.js';

/** The kinds of image a game asks the asset pipeline for. */
export type AssetKind = 'backdrop' | 'portrait' | 'icon' | 'key_art';

/** One image a game asks for, written from its art direction (never naming another game). */
export interface ImageRequest {
  /** The manifest key it is stored under. */
  key: string;
  kind: AssetKind;
  prompt: string;
  negative: readonly string[];
  /** The painter's theme to fall back to. */
  theme: string;
  layer?: Layer;
  w: number;
  h: number;
  seed: number;
}

/** An image as a provider returns it, at whatever size and colours it drew it. */
export interface ImageResult {
  image: PixelCanvas;
  provider: string;
  model: string;
  costUsd: number;
}

/** Something that makes images: an image model behind a key, or the procedural painter. */
export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}

/** Extra columns a layer is painted with, given up again to make it wrap. */
const WRAP_BAND = 24;

/** The procedural painter: needs no key and costs nothing, so dry runs, tests and a failed provider all fall back to it. */
export const PROCEDURAL: ImageProvider = {
  name: 'procedural',
  generate(req) {
    const theme = THEMES[req.theme] ?? THEMES['gothic']!;
    const layer = req.layer ?? 'far';
    return Promise.resolve({ image: theme.layers[layer](req.w + WRAP_BAND, req.h, req.seed), provider: 'procedural', model: `painter:${theme.id}`, costUsd: 0 });
  },
};

export interface FinishedImage {
  image: PixelCanvas;
  provider: string;
  model: string;
  costUsd: number;
  issues: BackdropIssue[];
}

/**
 * An image the game can use: from the first provider whose result, put on the game's pixel grid and palette (and made
 * to wrap, for a backdrop), passes the QA, else from the procedural painter.
 */
export async function finishImage(req: ImageRequest, palette: readonly RGB[], providers: readonly ImageProvider[]): Promise<FinishedImage> {
  let cost = 0;
  const tried: BackdropIssue[] = [];
  for (const p of [...providers, PROCEDURAL]) {
    let r: ImageResult;
    try {
      r = await p.generate(req);
    } catch (e) {
      tried.push({ code: 'provider_failed', message: `${p.name}: ${(e as Error).message}` });
      continue;
    }
    cost += r.costUsd;
    // Far and middle layers repeat as the camera moves, so they wrap; a near layer holds objects placed per room.
    const wraps = req.kind === 'backdrop' && req.layer !== 'near';
    const wide = r.image.w === req.w + WRAP_BAND && r.image.h === req.h ? r.image : toGrid(r.image, req.w + WRAP_BAND, req.h);
    const image = quantize(wraps ? tileable(wide, WRAP_BAND) : toGrid(wide, req.w, req.h), palette);
    const qa = checkBackdrop(image, { palette, layer: req.layer ?? 'far', tiles: wraps });
    if (qa.ok || p === PROCEDURAL) return { image, provider: r.provider, model: r.model, costUsd: cost, issues: [...tried, ...qa.issues] };
    tried.push(...qa.issues.map((i) => ({ ...i, message: `${p.name}: ${i.message}` })));
  }
  throw new Error('unreachable: the procedural painter always answers');
}
