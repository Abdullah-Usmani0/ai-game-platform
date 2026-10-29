import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlaytestReport, StateSnapshot } from '@gg/schemas';
import type { InputSegment } from '@gg/sdk';
import type { TestSeam } from '@gg/sdk/render';
import { openGame, seam, waitReady } from './browser.js';
import { runnerScript } from './scripts.js';
import { serveDir } from './server.js';

export interface SmokeOptions {
  dir: string;
  seed?: number;
  ticks?: number;
  script?: InputSegment[];
  outDir?: string;
  /** Also run the same script in realtime mode and compare the final hash (the determinism proof). */
  replayCheck?: boolean;
  /** File name of the report written to outDir (default playtest-report.json); runs at several seeds name theirs apart. */
  reportName?: string;
}

export interface SmokeResult {
  report: PlaytestReport;
  manual: StateSnapshot;
  realtime?: StateSnapshot;
  inPageReplay: StateSnapshot;
  readyMs: number;
  screenshotPath?: string;
}

/** Boot the bundle headless, drive it by script in manual mode, verify ready flag, errors, hashes and metrics. */
interface ManualRun {
  manual: StateSnapshot;
  events: Array<{ tick: number; name: string; payload: Record<string, unknown> }>;
  inPageReplay: StateSnapshot;
  readyMs: number;
  metrics: ReturnType<TestSeam['metrics']>;
  errors: string[];
  failures: string[];
  screenshotPath?: string;
}

async function runManual(url: string, script: InputSegment[], ticks: number, seed: number, outDir?: string): Promise<ManualRun> {
  const session = await openGame(url);
  try {
    const failures: string[] = [];
    const readyMs = await waitReady(session.page);
    const s = seam(session.page);
    if ((await s.mode()) !== 'manual') failures.push('expected manual mode');
    await s.runScript(script, ticks);
    const manual = await s.state();
    const events = await s.events();
    const inPageReplay = await s.replay(script, ticks, seed);
    if (manual.tick !== ticks) failures.push(`manual run stopped at tick ${manual.tick}, expected ${ticks}`);
    if (inPageReplay.hash !== manual.hash) failures.push(`in-page replay hash ${inPageReplay.hash} != live ${manual.hash}`);
    await session.page.waitForTimeout(100);
    const metrics = await s.metrics();
    let screenshotPath: string | undefined;
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      screenshotPath = join(outDir, `smoke-seed${seed}-tick${ticks}.png`);
      // The screenshot becomes the version's thumbnail: a moment of play, not the win screen after the bot finished.
      // The scripted run is deterministic, so replaying it to an earlier tick shows exactly what happened there.
      const won = events.find((e) => e.name === 'level_complete')?.tick;
      const shotTick = won === undefined ? ticks : Math.min(won - 10, Math.max(120, Math.round(won * 0.6)));
      if (shotTick !== ticks && shotTick > 0) {
        await s.runScript(script, shotTick);
        await session.page.waitForTimeout(100);
      }
      writeFileSync(screenshotPath, await s.screenshotPng());
    }
    return { manual, events, inPageReplay, readyMs, metrics, errors: [...session.consoleErrors, ...session.pageErrors], failures, screenshotPath };
  } finally {
    await session.close();
  }
}

async function runRealtime(url: string, script: InputSegment[], ticks: number): Promise<{ state: StateSnapshot; errors: string[]; failures: string[] }> {
  const session = await openGame(url);
  try {
    const failures: string[] = [];
    await waitReady(session.page);
    const s = seam(session.page);
    if ((await s.mode()) !== 'realtime') failures.push('expected realtime mode');
    await s.runScript(script, ticks);
    const state = await s.state();
    if (state.tick < ticks) failures.push(`realtime run stopped at tick ${state.tick}`);
    return { state, errors: [...session.consoleErrors, ...session.pageErrors], failures };
  } finally {
    await session.close();
  }
}

/** Boot the bundle headless, drive it by script in manual mode, verify ready flag, errors, hashes and metrics. */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeResult> {
  const seed = opts.seed ?? 1;
  const ticks = opts.ticks ?? 600;
  const script = opts.script ?? runnerScript(ticks);
  const server = await serveDir(opts.dir);
  let run: ManualRun;
  let realtime: StateSnapshot | undefined;
  const failures: string[] = [];
  const consoleErrors: string[] = [];
  try {
    run = await runManual(`${server.url}/index.html?mode=manual&seed=${seed}`, script, ticks, seed, opts.outDir);
    failures.push(...run.failures);
    consoleErrors.push(...run.errors);
    if (opts.replayCheck) {
      const rt = await runRealtime(`${server.url}/index.html?mode=realtime&autoplay=1&seed=${seed}`, script, ticks);
      realtime = rt.state;
      failures.push(...rt.failures);
      consoleErrors.push(...rt.errors);
      if (realtime.hash !== run.manual.hash) failures.push(`realtime hash ${realtime.hash} != manual ${run.manual.hash}`);
    }
  } finally {
    await server.close();
  }
  if (consoleErrors.length > 0) failures.push(`${consoleErrors.length} console/page error(s): ${consoleErrors[0]}`);
  const { manual, events, inPageReplay, readyMs, metrics, screenshotPath } = run;
  const report: PlaytestReport = {
    version: 1,
    createdAt: new Date().toISOString(),
    seeds: [seed],
    bots: [
      {
        bot: 'runner-script',
        seed,
        ticks: manual.tick,
        completed: manual.flags.won,
        deaths: Number((manual.hud as Record<string, unknown>)['deaths'] ?? 0),
        stuckMaxTicks: 0,
        crashes: consoleErrors,
        finalHash: manual.hash,
        metrics: { fps: metrics.fps, frameMsP95: metrics.frameMsP95, heapMB: metrics.heapMB, readyMs },
      },
    ],
    consoleErrors,
    events,
    readyMs,
    replayHashMatch: realtime ? realtime.hash === manual.hash : inPageReplay.hash === manual.hash,
    passed: failures.length === 0,
    failures,
  };
  if (opts.outDir) {
    mkdirSync(opts.outDir, { recursive: true });
    writeFileSync(join(opts.outDir, opts.reportName ?? 'playtest-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return { report, manual, realtime, inPageReplay, readyMs, screenshotPath };
}
