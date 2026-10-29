import type { StateSnapshot } from '@gg/schemas';
import type { InputSegment, InputState } from '../sim/input.js';
import { replay } from '../sim/sim.js';
import type { GameBuild, GameController, SceneKey } from './controller.js';
import type { RunMode } from './driver.js';

export interface TestSeam {
  mode: RunMode;
  state(): StateSnapshot;
  render_game_to_text(): string;
  step(n?: number): void;
  advanceTime(ms: number): void;
  setInput(partial: Partial<InputState>): void;
  press(key: keyof InputState): void;
  release(key: keyof InputState): void;
  inputLog(): ReadonlyArray<{ tick: number; input: InputState }>;
  runScript(segments: InputSegment[], until: number): Promise<void>;
  /** Fresh in-page sim for the current level under a script; the replay oracle. */
  replay(segments: InputSegment[], ticks: number, seed?: number): StateSnapshot;
  goto(scene: SceneKey, params?: { level?: number }): void;
  setSeed(seed: number): void;
  reset(): void;
  events: { history(): ReadonlyArray<{ tick: number; name: string; payload: Record<string, unknown> }>; count(name: string): number };
  metrics(): { fps: number; frameMsP95: number; frameMsAvg: number; heapMB: number; samples: number };
  screenshot(): Promise<string>;
  levels(): string[];
}

export interface TestFlag {
  ready: boolean;
  readyPromise: Promise<void>;
  seed: number;
  build: GameBuild;
  mode: RunMode;
}

declare global {
  interface Window {
    __game?: TestSeam;
    __TEST__?: TestFlag;
  }
}

export function installTestSeam(
  controller: GameController,
  build: GameBuild,
  screenshot: () => Promise<string>,
): { seam: TestSeam; flag: TestFlag; markReady: () => void } {
  let markReady = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    markReady = () => {
      flag.ready = true;
      resolve();
    };
  });
  const flag: TestFlag = { ready: false, readyPromise, seed: controller.seed, build, mode: controller.mode };
  const seam: TestSeam = {
    mode: controller.mode,
    state: () => controller.snapshot(),
    render_game_to_text: () => controller.renderToText(),
    step: (n = 1) => controller.step(n),
    advanceTime: (ms) => controller.step(Math.round(ms / (1000 / 60))),
    setInput: (partial) => controller.setInput(partial),
    press: (key) => controller.press(key),
    release: (key) => controller.release(key),
    inputLog: () => controller.sim.inputLog(),
    runScript: (segments, until) => controller.runScript(segments, until),
    replay: (segments, ticks, seed) =>
      replay({ ...controller.options.simOptions, level: controller.level, seed: seed ?? controller.sim.rng.seed, carry: controller.carry }, segments, ticks),
    goto: (scene, params) => {
      // A level reached by goto starts fresh, as the node-side bots and gates play it.
      if (params?.level !== undefined) controller.loadLevel(params.level, controller.seed, {});
      controller.setScene(scene);
    },
    setSeed: (seed) => controller.reset(seed),
    reset: () => controller.reset(),
    events: { history: () => controller.sim.events.history(), count: (name) => controller.sim.events.count(name) },
    metrics: () => controller.metrics.snapshot(),
    screenshot,
    levels: () => controller.options.levels.map((l) => l.id),
  };
  window.__game = seam;
  window.__TEST__ = flag;
  return { seam, flag, markReady };
}
