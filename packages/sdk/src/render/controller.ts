import { chapterOf, DialogueFile, type DialogueNode, type LevelJson, type ParamValue, type StateSnapshot } from '@gg/schemas';
import { emptyInput, inputAtTick, type InputSegment, type InputState } from '../sim/input.js';
import { stepLines } from '../sim/lines.js';
import { createSim, levelSeed, TICK_RATE, type ProgressSave, type Sim, type SimOptions } from '../sim/sim.js';
import type { DialogueState } from '../sim/world.js';
import { Driver, type RunMode } from './driver.js';
import { Keyboard } from './keyboard.js';
import { Metrics } from './metrics.js';

/** `story`: a chapter's narration read before its level's first moment (the level waits at tick 0). */
export type SceneKey = 'boot' | 'title' | 'story' | 'play' | 'results';

const STEP_MS = 1000 / TICK_RATE;

/** How long after the last level is won the story's ending opens, and how long after its epilogue the results follow. */
const ENDING_DELAY_TICKS = 40;
const AFTER_EPILOGUE_TICKS = 50;

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
/** What the view could not draw as the game asked, filled in as it draws (the test seam reads it). */
export interface DrawStats {
  /** The game's own sprite designs the view drew with. */
  designs: number;
  /** Types whose design could not be read or drawn: they drew as their shipped sprite. */
  designFallbacks: string[];
  /** Types no sprite draws: they drew as a placeholder shape. */
  blobFallbacks: string[];
}

export class GameController {
  sim: Sim;
  driver: Driver;
  readonly keyboard = new Keyboard();
  readonly metrics = new Metrics();
  readonly drawStats: DrawStats = { designs: 0, designFallbacks: [], blobFallbacks: [] };
  scene: SceneKey = 'boot';
  levelIndex = 0;
  seed: number;
  /** Player props the current level started with: carried from the level before it, empty after a reset. */
  carry: Record<string, ParamValue> = {};
  /** The save the current level was picked up from (a Continue), or null when it started at its start. */
  resume: ProgressSave | null = null;
  private held: InputState = emptyInput();
  private script: { segments: InputSegment[]; until: number; resolve: () => void } | null = null;
  /** Set when a script has run to its target tick: the sim holds there until a step, script or reset. */
  private frozen = false;
  private sceneListeners = new Set<Listener>();
  private levelListeners = new Set<Listener>();
  /** Tick at which the level was won (-1 while playing); results follow 90 ticks later. */
  private winTick = -1;
  /** Whether the game's end has been played on this level (Sim.end, once the last level is won). */
  private ended = false;

  /** Whether the game's story has endings (content/dialogue.json): its last level won plays one, instead of a "clear". */
  readonly storied: boolean;
  /** The game's story, for its chapters (null: none). */
  private readonly story: DialogueFile | null;
  /** The narration being read in the `story` scene, on a clock of its own (the sim does not step while it is read). */
  private reading: DialogueState | null = null;
  private storyTick = 0;
  private storyAcc = 0;
  /** The keys as they were on the narration's last tick: a key held as it opens is not a press. */
  private storyPrev: InputState = emptyInput();

  constructor(public readonly options: ControllerOptions) {
    this.story = DialogueFile.safeParse(options.simOptions.content?.['dialogue']).data ?? null;
    this.storied = (this.story?.endings ?? []).length > 0;
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
    return createSim({ ...this.options.simOptions, level, seed: levelSeed(seed, levelIndex), carry: this.carry, ...(this.resume ? { resume: this.resume } : {}) });
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

  /** The narration being read before a level (the `story` scene), for the view to draw. */
  get narration(): DialogueState | null {
    return this.reading;
  }

  /** The title a level's chapter gives it (counted from 0), or null. */
  chapterTitle(levelIndex: number): string | null {
    return chapterOf(this.story, levelIndex)?.title ?? null;
  }

  /** The player starts, from the title or playing again: the first chapter's narration is read first, when it has one. */
  begin(): void {
    if (!this.narrate()) this.setScene('play');
  }

  /**
   * Opens the current level's chapter, if it has narration and this is a person playing in real time: never for a
   * script, a frozen sim, a Continue, or manual stepping (tests, bots, agents), so their runs are exactly as before.
   */
  private narrate(): boolean {
    if (this.mode !== 'realtime' || this.script || this.frozen || this.resume) return false;
    const chapter = chapterOf(this.story, this.levelIndex);
    const node = chapter?.node ? this.storyNode(chapter.node) : undefined;
    if (!node) return false;
    this.storyTick = 0;
    this.storyAcc = 0;
    this.reading = this.readingOf(node);
    this.storyPrev = this.keyboard.read();
    this.setScene('story');
    return true;
  }

  private storyNode(id: string): DialogueNode | undefined {
    return this.story?.nodes.find((n) => n.id === id);
  }

  private readingOf(node: DialogueNode): DialogueState {
    return { node: node.id, speaker: node.speaker, name: this.story?.names[node.speaker] ?? '', lines: [...node.lines], line: 0, shown: 0, openedTick: this.storyTick };
  }

  /** One tick of narration: read as a talk is read (the same stepper); its last line read on, the next node or play. */
  private stepNarration(input: InputState): void {
    const d = this.reading;
    if (!d) return;
    const pressed = (input.action && !this.storyPrev.action) || (input.jump && !this.storyPrev.jump);
    this.storyPrev = { ...input };
    const read = stepLines(d, this.storyTick, pressed);
    this.storyTick++;
    if (read !== 'end') return;
    const next = this.storyNode(d.node)?.next;
    const node = next ? this.storyNode(next) : undefined;
    if (node) {
      this.reading = this.readingOf(node);
      return;
    }
    this.reading = null;
    this.setScene('play');
  }

  /** Called once per rendered frame by the view. Advances in realtime mode and handles win flow. */
  frame(deltaMs: number): void {
    this.metrics.record(deltaMs);
    if (this.frozen) return;
    // A chapter's narration runs at the sim's rate on its own clock, while the level waits at its first tick.
    if (this.scene === 'story') {
      this.storyAcc += Math.min(deltaMs, 250);
      while (this.storyAcc >= STEP_MS && this.reading) {
        this.storyAcc -= STEP_MS;
        this.stepNarration(this.keyboard.read());
      }
      return;
    }
    // The sim runs during play, and keeps ticking on the results screen while a script drives it,
    // so scripted runs behave identically in manual and realtime mode.
    if (this.scene !== 'play' && !(this.scene === 'results' && this.script)) return;
    const limit = this.script ? Math.max(0, this.script.until - this.sim.tick) : Infinity;
    this.driver.frame(deltaMs, limit);
    this.afterSteps();
  }

  step(n = 1): void {
    this.frozen = false;
    // Stepped through a narration (a test driving the page by hand): its ticks go to the narration, not the sim.
    for (; n > 0 && this.scene === 'story'; n--) this.stepNarration(this.keyboard.read());
    if (this.scene === 'title') this.setScene('play');
    // One step at a time so level sequencing happens at the same tick as in realtime play.
    for (let i = 0; i < n; i++) {
      this.driver.step(1);
      this.afterSteps();
    }
  }

  private afterSteps(): void {
    const w = this.sim.world;
    if (!w.flags.won) return;
    // The wait for the next level starts once no menu or talk is open (a choice made as the level ends still carries,
    // and an epilogue is read to its end).
    if (this.winTick < 0 || w.menu || w.dialogue) this.winTick = this.sim.tick;
    // Level sequencing is free-play only: a scripted run (the determinism oracle) and a frozen sim hold the won
    // level and keep ticking it, so manual, realtime and in-page replay hashes agree whatever the level count.
    if (this.script || this.frozen) return;
    // The last level won ends the game, a moment after: the story's ending, its epilogue read before the results.
    if (!this.ended && this.levelIndex + 1 >= this.options.levels.length && this.sim.tick - this.winTick >= ENDING_DELAY_TICKS) {
      this.ended = true;
      if (this.sim.end()) return;
    }
    if (this.sim.tick - this.winTick > (w.ending ? AFTER_EPILOGUE_TICKS : 90) && this.scene === 'play') this.nextLevel();
  }

  nextLevel(): void {
    this.winTick = -1;
    // What the player earned on this level (boons, upgrades in its props) comes along to the next one.
    if (this.levelIndex + 1 < this.options.levels.length) {
      this.loadLevel(this.levelIndex + 1, this.seed, { ...this.sim.world.player.props });
      // The next chapter's narration, when the story has one, before its level begins.
      this.narrate();
    } else this.setScene('results');
  }

  /**
   * Load a level. `carry` is the player props it starts with (by default what the current level started with, so a retry
   * keeps them); `resume` a save to pick it up from instead of its start (a Continue). A retry starts it at its start.
   */
  loadLevel(index: number, seed = this.seed, carry: Record<string, ParamValue> = this.carry, resume: ProgressSave | null = null): void {
    this.levelIndex = index;
    this.seed = seed;
    this.carry = carry;
    this.resume = resume;
    this.sim = this.makeSim(index, seed);
    this.driver = new Driver(this.sim, this.driver.mode, (tick) => this.provideInput(tick));
    this.winTick = -1;
    this.ended = false;
    this.frozen = false;
    this.reading = null;
    for (const l of this.levelListeners) l();
    this.setScene('play');
  }

  reset(seed = this.options.seed): void {
    this.loadLevel(0, seed, {});
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
      ...(s.menu ? [`menu ${s.menu.id} selected=${s.menu.options[s.menu.selected] ?? s.menu.selected} options=${s.menu.options.join(',')}`] : []),
      ...s.entities.map((e) => `  ${String(e.type)}#${String(e.id)} x=${String(e.x)} y=${String(e.y)} hp=${String(e.hp)} state=${String(e.state)}`),
    ];
    return lines.join('\n');
  }
}
