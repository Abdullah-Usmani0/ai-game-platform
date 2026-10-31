import type { LevelJson } from '@gg/schemas';
import { DEFAULT_SEED, winningRun, type SimOptions } from '../sim/sim.js';
import { BridgeGuest } from './bridge-guest.js';
import { GameController, type GameBuild } from './controller.js';
import type { RunMode } from './driver.js';
import { createPhaserGame, type MainScene, type ViewStyle } from './phaser-view.js';
import { readSaveBlob, saveBlob } from './saves.js';
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
  const seed = init?.seed ?? query.seed ?? opts.defaultSeed ?? DEFAULT_SEED;
  const controller = new GameController({ levels: opts.levels, simOptions: opts.sim, seed, mode, build: opts.build });
  // A Continue: the host gave back the save the game left at the player's last rest, and play picks the level up there.
  const start = readSaveBlob(init?.save, opts.levels);
  if (start) controller.loadLevel(start.level, seed, start.carry, start.save);
  controller.keyboard.attach(window);

  let phaser: Phaser.Game | null = null;
  let view: MainScene | null = null;
  const screenshot = async (): Promise<string> => {
    const canvas = phaser?.canvas;
    if (!canvas) return '';
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    return canvas.toDataURL('image/png');
  };
  const { seam, markReady } = installTestSeam(controller, opts.build, screenshot);

  const ready = new Promise<void>((resolve) => {
    // The host's preferences: shake off when the player asked for less motion, sound off when they muted the site.
    const style = init?.prefs.reduceShake ? { ...opts.style, camera: { ...opts.style.camera, maxShake: 0 } } : opts.style;
    ({ game: phaser, scene: view } = createPhaserGame(controller, style, opts.parent, () => {
      if (init?.prefs.mute && view) view.sfx.muted = true;
      if (mode === 'manual' || query.autoplay || init?.mode === 'preview' || start) controller.setScene('play');
      else controller.setScene('title');
      markReady();
      bridge.send({ type: 'ready', scenes: ['title', 'play', 'results'], levels: opts.levels.map((l) => l.id) });
      resolve();
    }));
  });

  bridge.on((msg) => {
    switch (msg.type) {
      case 'pause':
        controller.sim.world.flags.paused = true;
        return;
      case 'resume':
        controller.sim.world.flags.paused = false;
        return;
      case 'mute':
        if (view) view.sfx.muted = msg.muted;
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

  const saveBytes = init?.limits.saveBytes ?? 65536;
  const forward = () =>
    controller.sim.events.on('*', (ev) => {
      if (['death', 'level_complete', 'pickup', 'checkpoint'].includes(ev.name)) {
        bridge.send({ type: 'event', name: ev.name, payload: ev.payload, tick: ev.tick });
      }
      // A rest leaves its save with the host, which offers it back as a Continue.
      if (ev.name === 'custom:rest') {
        const blob = saveBlob(controller.levelIndex, controller.level.id, ev.payload['save'], controller.carry, saveBytes);
        if (blob) bridge.send({ type: 'save', blob });
      }
      // A level a player won is evidence it can be won: the run from the level's start goes to the host, which keeps it
      // when the level waits for a winning run. Bots that drive the game (manual mode) record their own, and a run picked
      // up from a save did not start at the level's start.
      if (ev.name === 'level_complete' && controller.mode === 'realtime' && !controller.resume) bridge.send({ type: 'proof', proof: winningRun(controller.sim, ev.tick) });
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
