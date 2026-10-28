import type { LevelJson } from '@gg/schemas';
import type { SimOptions } from '../sim/sim.js';
import { BridgeGuest } from './bridge-guest.js';
import { GameController, type GameBuild } from './controller.js';
import type { RunMode } from './driver.js';
import { createPhaserGame, type ViewStyle } from './phaser-view.js';
import { installTestSeam, type TestSeam } from './test-seam.js';

export interface GameOptions {
  levels: LevelJson[];
  sim: Omit<SimOptions, 'level' | 'seed'>;
  style: ViewStyle;
  build: GameBuild;
  parent?: HTMLElement | string;
  defaultSeed?: number;
  defaultMode?: RunMode;
}

export interface GameHandle {
  controller: GameController;
  seam: TestSeam;
  bridge: BridgeGuest;
  ready: Promise<void>;
}

function readQuery(): { mode?: RunMode; seed?: number; autoplay: boolean } {
  const q = new URLSearchParams(window.location.search);
  const modeRaw = q.get('mode');
  const mode: RunMode | undefined = q.get('test') === '1' || modeRaw === 'manual' ? 'manual' : modeRaw === 'realtime' ? 'realtime' : undefined;
  const seedRaw = q.get('seed');
  const seed = seedRaw !== null && /^-?\d+$/.test(seedRaw) ? Number(seedRaw) : undefined;
  return { mode, seed, autoplay: q.get('autoplay') === '1' };
}

/** Boot a game: bridge handshake (or query params), controller, test seam, Phaser view. */
export async function createGame(opts: GameOptions): Promise<GameHandle> {
  const bridge = new BridgeGuest(opts.build);
  const init = await bridge.connect();
  const query = readQuery();
  const mode: RunMode = init ? (init.mode === 'test' ? 'manual' : 'realtime') : (query.mode ?? opts.defaultMode ?? 'realtime');
  const seed = init?.seed ?? query.seed ?? opts.defaultSeed ?? 1;
  const controller = new GameController({ levels: opts.levels, simOptions: opts.sim, seed, mode, build: opts.build });
  controller.keyboard.attach(window);

  let phaser: Phaser.Game | null = null;
  const screenshot = async (): Promise<string> => {
    const canvas = phaser?.canvas;
    if (!canvas) return '';
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    return canvas.toDataURL('image/png');
  };
  const { seam, markReady } = installTestSeam(controller, opts.build, screenshot);

  const ready = new Promise<void>((resolve) => {
    phaser = createPhaserGame(controller, opts.style, opts.parent, () => {
      if (mode === 'manual' || query.autoplay || init?.mode === 'preview') controller.setScene('play');
      else controller.setScene('title');
      markReady();
      bridge.send({ type: 'ready', scenes: ['title', 'play', 'results'], levels: opts.levels.map((l) => l.id) });
      resolve();
    });
  });

  bridge.on((msg) => {
    switch (msg.type) {
      case 'pause':
        controller.sim.world.flags.paused = true;
        return;
      case 'resume':
        controller.sim.world.flags.paused = false;
        return;
      case 'request_state':
        bridge.send({ type: 'state', state: controller.snapshot() });
        return;
      case 'request_screenshot':
        void screenshot().then((png) => bridge.send({ type: 'screenshot', png }));
        return;
      case 'destroy':
        phaser?.destroy(true);
        return;
      default:
        return;
    }
  });

  const forward = () =>
    controller.sim.events.on('*', (ev) => {
      if (['death', 'level_complete', 'pickup', 'checkpoint'].includes(ev.name)) {
        bridge.send({ type: 'event', name: ev.name, payload: ev.payload, tick: ev.tick });
      }
    });
  let unsubForward = forward();
  controller.onLevelChange(() => {
    unsubForward();
    unsubForward = forward();
  });
  if (bridge.connected) {
    setInterval(() => {
      const m = controller.metrics.snapshot();
      bridge.send({ type: 'metrics', fps: m.fps, frameMsP95: m.frameMsP95, heapMB: m.heapMB });
    }, 5000);
  }
  window.addEventListener('error', (e) => bridge.send({ type: 'error', message: String(e.message), stack: e.error?.stack, fatal: false }));

  return { controller, seam, bridge, ready };
}
