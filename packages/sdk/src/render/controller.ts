import type { LevelJson, StateSnapshot } from '@gg/schemas';
import { emptyInput, inputAtTick, type InputSegment, type InputState } from '../sim/input.js';
import { createSim, type Sim, type SimOptions } from '../sim/sim.js';
import { Driver, type RunMode } from './driver.js';
import { Keyboard } from './keyboard.js';
import { Metrics } from './metrics.js';

export type SceneKey = 'boot' | 'title' | 'play' | 'results';

export interface GameBuild {
  gameId: string;
  versionId: string;
  engine: string;
}

export interface ControllerOptions {
  levels: LevelJson[];
  simOptions: Omit<SimOptions, 'level' | 'seed'>;
  seed: number;
  mode: RunMode;
  build: GameBuild;
}

type Listener = () => void;

/**
 * Engine-agnostic game controller: owns the sim, level sequencing, input routing,
 * the test seam state and metrics. The Phaser adapter is a thin view over this.
 */
export class GameController {
  sim: Sim;
  driver: Driver;
  readonly keyboard = new Keyboard();
  readonly metrics = new Metrics();
  scene: SceneKey = 'boot';
  levelIndex = 0;
  seed: number;
  private held: InputState = emptyInput();
  private script: { segments: InputSegment[]; until: number; resolve: () => void } | null = null;
  /** Set when a script has run to its target tick: the sim holds there until a step, script or reset. */
  private frozen = false;
  private sceneListeners = new Set<Listener>();
  private levelListeners = new Set<Listener>();
  /** Tick at which the level was won (-1 while playing); results follow 90 ticks later. */
  private winTick = -1;

  constructor(public readonly options: ControllerOptions) {
    this.seed = options.seed;
    this.sim = this.makeSim(0, this.seed);
    this.driver = new Driver(this.sim, options.mode, (tick) => this.provideInput(tick));
  }

  get mode(): RunMode {
    return this.driver.mode;
  }

  get level(): LevelJson {
    const lvl = this.options.levels[this.levelIndex];
    if (!lvl) throw new Error('no levels');
    return lvl;
  }

  private makeSim(levelIndex: number, seed: number): Sim {
    const level = this.options.levels[levelIndex];
    if (!level) throw new Error(`level index ${levelIndex} out of range`);
    return createSim({ ...this.options.simOptions, level, seed: seed + levelIndex });
  }

  private provideInput(tick: number): InputState {
    if (this.script) {
      const input = inputAtTick(this.script.segments, tick);
      if (tick + 1 >= this.script.until) {
        const done = this.script;
        this.script = null;
        this.frozen = true;
        queueMicrotask(done.resolve);
      }
      return input;
    }
    if (this.mode === 'manual') return { ...this.held };
    return this.keyboard.read();
  }

  onSceneChange(l: Listener): () => void {
    this.sceneListeners.add(l);
    return () => this.sceneListeners.delete(l);
  }

  onLevelChange(l: Listener): () => void {
    this.levelListeners.add(l);
    return () => this.levelListeners.delete(l);
  }

  setScene(scene: SceneKey): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.sim.events.emit(this.sim.tick, scene === 'play' ? 'ui_close' : 'ui_open', { scene });
    for (const l of this.sceneListeners) l();
  }

  /** Called once per rendered frame by the view. Advances in realtime mode and handles win flow. */
  frame(deltaMs: number): void {
    this.metrics.record(deltaMs);
    if (this.frozen) return;
    // The sim runs during play, and keeps ticking on the results screen while a script drives it,
    // so scripted runs behave identically in manual and realtime mode.
    if (this.scene !== 'play' && !(this.scene === 'results' && this.script)) return;
    const limit = this.script ? Math.max(0, this.script.until - this.sim.tick) : Infinity;
    this.driver.frame(deltaMs, limit);
    this.afterSteps();
  }

  step(n = 1): void {
    this.frozen = false;
    if (this.scene === 'title') this.setScene('play');
    this.driver.step(n);
    this.afterSteps();
  }

  private afterSteps(): void {
    const w = this.sim.world;
    if (!w.flags.won) return;
    if (this.winTick < 0) this.winTick = this.sim.tick;
    if (this.sim.tick - this.winTick > 90 && this.scene === 'play') this.nextLevel();
  }

  nextLevel(): void {
    this.winTick = -1;
    if (this.levelIndex + 1 < this.options.levels.length) this.loadLevel(this.levelIndex + 1);
    else this.setScene('results');
  }

  loadLevel(index: number, seed = this.seed): void {
    this.levelIndex = index;
    this.seed = seed;
    this.sim = this.makeSim(index, seed);
    this.driver = new Driver(this.sim, this.driver.mode, (tick) => this.provideInput(tick));
    this.winTick = -1;
    this.frozen = false;
    for (const l of this.levelListeners) l();
    this.setScene('play');
  }

  reset(seed = this.options.seed): void {
    this.loadLevel(0, seed);
  }

  setInput(partial: Partial<InputState>): void {
    Object.assign(this.held, partial);
  }

  press(key: keyof InputState): void {
    this.held[key] = true;
  }

  release(key: keyof InputState): void {
    this.held[key] = false;
  }

  /**
   * Restart the current level with the current seed and drive it by a script until `until` tick,
   * then hold the sim there. Manual mode runs synchronously; realtime resolves when the tick is reached.
   * Same seed + same script => same hash in both modes: this is the determinism oracle.
   */
  runScript(segments: InputSegment[], until: number): Promise<void> {
    this.loadLevel(this.levelIndex, this.seed);
    return new Promise<void>((resolve) => {
      this.script = { segments, until, resolve };
      if (this.mode === 'manual') {
        const n = Math.max(0, until - this.sim.tick);
        this.step(n);
        if (this.script) {
          this.script = null;
          resolve();
        }
      }
    });
  }

  snapshot(): StateSnapshot {
    const s = this.sim.snapshot();
    return { ...s, scene: this.scene };
  }

  renderToText(): string {
    const s = this.snapshot();
    const p = s.player as Record<string, number | boolean | string>;
    const lines = [
      `tick=${s.tick} scene=${s.scene} level=${s.level} hash=${s.hash}`,
      `player x=${p.x} y=${p.y} vx=${p.vx} vy=${p.vy} hp=${p.hp} grounded=${p.grounded} alive=${p.alive}`,
      `hud ${JSON.stringify(s.hud)} flags ${JSON.stringify(s.flags)} rng ${JSON.stringify(s.rng)}`,
      ...s.entities.map((e) => `  ${String(e.type)}#${String(e.id)} x=${String(e.x)} y=${String(e.y)} hp=${String(e.hp)} state=${String(e.state)}`),
    ];
    return lines.join('\n');
  }
}
