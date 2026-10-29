import { chromium, type Browser, type Page } from 'playwright';
import type { InputSegment } from '@gg/sdk';
import type { TestSeam } from '@gg/sdk/render';
import type { StateSnapshot } from '@gg/schemas';

export interface PageSession {
  browser: Browser;
  page: Page;
  consoleErrors: string[];
  pageErrors: string[];
  close(): Promise<void>;
}

export async function openGame(url: string, opts: { headless?: boolean } = {}): Promise<PageSession> {
  const browser = await chromium.launch({ headless: opts.headless ?? true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message)));
  await page.goto(url, { waitUntil: 'load' });
  return { browser, page, consoleErrors, pageErrors, close: () => browser.close() };
}

/** Wait for the SDK ready flag rather than sleeping. Returns ms to ready. */
export async function waitReady(page: Page, timeoutMs = 20000): Promise<number> {
  const t0 = Date.now();
  await page.waitForFunction(() => window.__TEST__?.ready === true, undefined, { timeout: timeoutMs });
  return Date.now() - t0;
}

export function seam(page: Page): {
  state(): Promise<StateSnapshot>;
  text(): Promise<string>;
  step(n: number): Promise<void>;
  runScript(segments: InputSegment[], until: number): Promise<void>;
  replay(segments: InputSegment[], ticks: number, seed?: number): Promise<StateSnapshot>;
  eventCount(name: string): Promise<number>;
  events(): Promise<Array<{ tick: number; name: string; payload: Record<string, unknown> }>>;
  metrics(): Promise<ReturnType<TestSeam['metrics']>>;
  mode(): Promise<string>;
  screenshotPng(): Promise<Buffer>;
  /** Start a level fresh (no carried props), as the Node-side bots and proofs play it. */
  gotoLevel(index: number): Promise<void>;
} {
  return {
    state: () => page.evaluate(() => window.__game!.state()),
    text: () => page.evaluate(() => window.__game!.render_game_to_text()),
    step: (n) => page.evaluate((k) => window.__game!.step(k), n),
    runScript: (segments, until) => page.evaluate(([s, u]) => window.__game!.runScript(s as InputSegment[], u as number), [segments, until] as const),
    replay: (segments, ticks, seed) => page.evaluate(([s, t, sd]) => window.__game!.replay(s as InputSegment[], t as number, sd as number | undefined), [segments, ticks, seed] as const),
    eventCount: (name) => page.evaluate((n) => window.__game!.events.count(n), name),
    events: () => page.evaluate(() => window.__game!.events.history().map((e) => ({ tick: e.tick, name: e.name, payload: e.payload }))),
    metrics: () => page.evaluate(() => window.__game!.metrics()),
    mode: () => page.evaluate(() => window.__game!.mode),
    screenshotPng: () => page.screenshot({ type: 'png' }),
    gotoLevel: (index) => page.evaluate((i) => window.__game!.goto('play', { level: i }), index),
  };
}
