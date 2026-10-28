import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { InputSegment } from '@gg/sdk';
import { openGame, seam, waitReady } from './browser.js';
import { runnerScript } from './scripts.js';
import { serveDir } from './server.js';

export interface ContactSheetOptions {
  dir: string;
  outDir: string;
  seed?: number;
  ticks?: number;
  frames?: number;
  script?: InputSegment[];
  columns?: number;
}

/** Capture N frames across a scripted run and tile them into one PNG for the art-director / human review. */
export async function contactSheet(opts: ContactSheetOptions): Promise<string> {
  const seed = opts.seed ?? 1;
  const ticks = opts.ticks ?? 600;
  const frames = opts.frames ?? 12;
  const columns = opts.columns ?? 4;
  const script = opts.script ?? runnerScript(ticks);
  const server = await serveDir(opts.dir);
  const shots: PNG[] = [];
  try {
    const session = await openGame(`${server.url}/index.html?mode=manual&seed=${seed}`);
    try {
      await waitReady(session.page);
      const s = seam(session.page);
      const per = Math.max(1, Math.floor(ticks / frames));
      for (let i = 0; i < frames; i++) {
        await s.runScript(script, (i + 1) * per);
        await session.page.waitForTimeout(40);
        shots.push(PNG.sync.read(await s.screenshotPng()));
      }
    } finally {
      await session.close();
    }
  } finally {
    await server.close();
  }
  const first = shots[0];
  if (!first) throw new Error('no frames captured');
  const rows = Math.ceil(shots.length / columns);
  const sheet = new PNG({ width: first.width * columns, height: first.height * rows });
  shots.forEach((png, i) => {
    const ox = (i % columns) * first.width;
    const oy = Math.floor(i / columns) * first.height;
    PNG.bitblt(png, sheet, 0, 0, png.width, png.height, ox, oy);
  });
  mkdirSync(opts.outDir, { recursive: true });
  const out = join(opts.outDir, `contact-sheet-seed${seed}.png`);
  writeFileSync(out, PNG.sync.write(sheet));
  return out;
}
