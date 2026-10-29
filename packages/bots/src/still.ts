import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InputSegment } from '@gg/sdk';
import { openGame, waitReady } from './browser.js';
import { runnerScript } from './scripts.js';
import { serveDir } from './server.js';

export interface StillOptions {
  dir: string;
  out: string;
  seed?: number;
  /** The tick to capture, driven by the runner script (or `script`). */
  tick?: number;
  script?: InputSegment[];
}

/** One frame of a scripted run at the game's own resolution (the canvas, not the page): covers and genre previews. */
export async function still(opts: StillOptions): Promise<{ out: string; errors: string[] }> {
  const tick = opts.tick ?? 240;
  const server = await serveDir(opts.dir);
  try {
    const session = await openGame(`${server.url}/index.html?mode=manual&seed=${opts.seed ?? 1}`);
    try {
      await waitReady(session.page);
      await session.page.evaluate(([s, t]) => window.__game!.runScript(s as InputSegment[], t as number), [opts.script ?? runnerScript(tick + 60), tick] as const);
      // Two frames: the view draws the tick it was stepped to, then the canvas is read.
      await session.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const dataUrl = await session.page.evaluate(() => window.__game!.screenshot());
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      return { out: opts.out, errors: [...session.pageErrors, ...session.consoleErrors] };
    } finally {
      await session.close();
    }
  } finally {
    await server.close();
  }
}
