import type { BehaviourFsm, EcaRule, GameEventRecord, LevelJson, ParamValue, StateSnapshot } from '@gg/schemas';
import { EventBus } from './events.js';
import type { FeelPreset } from './feel.js';
import { fireRule, stepFsm } from './fsm.js';
import { hashValue } from './hash.js';
import { emptyInput, inputAtTick, inputEquals, type InputFrame, type InputSegment, type InputState } from './input.js';
import { moveBody, overlaps } from './physics.js';
import { Rng } from './rng.js';
import type { MenuSpec, SimCtx, SystemDef } from './system.js';
import { Tilemap } from './tilemap.js';
import { makeEntity, type Entity, type EntityDef, type Menu, type World } from './world.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** A menu ignores picks for this many ticks after it opens (0.3 s), so a held or mashed key never chooses unread. */
export const MENU_GRACE_TICKS = 18;
/** Options a menu shows at most (four cards fit the smallest canvas). */
export const MENU_MAX_OPTIONS = 4;

export interface SimOptions {
  level: LevelJson;
  feel: FeelPreset;
  seed: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systems: SystemDef<any>[];
  entityDefs: EntityDef[];
  player: { w: number; h: number; hp: number };
  behaviours?: BehaviourFsm[];
  rules?: EcaRule[];
  params?: Record<string, Record<string, ParamValue>>;
  /** Arbitrary content JSON systems may read (waves, dialogue, progression). */
  content?: Record<string, unknown>;
  /** 'platformer' (gravity, facing along x) or 'topdown' (no gravity, FSM moves on both axes). */
  movementMode?: 'platformer' | 'topdown';
  /** Player props carried over from the previous level (boons, upgrades); copied onto the player before systems init. */
  carry?: Readonly<Record<string, ParamValue>>;
  /** The systems whose progress hooks count toward progress() (a composed game's win owner); every system's when unset. */
  progressFrom?: readonly string[];
}

/** A save point: everything the steps after it depend on, as plain data (see Sim.save). */
export interface SimSave {
  readonly tick: number;
  readonly data: unknown;
}

interface SaveData {
  world: World;
  states: Array<[string, unknown]>;
  pending: GameEventRecord[];
  tiles: ReturnType<Tilemap['saveTiles']>;
  rng: ReturnType<Rng['getState']>;
  events: ReturnType<EventBus['saveCounts']>;
  lastInput: InputState;
  prevInput: InputState;
}

export interface Sim {
  readonly options: SimOptions;
  readonly world: World;
  readonly map: Tilemap;
  readonly events: EventBus;
  readonly rng: Rng;
  readonly tick: number;
  /** Advance one fixed step with the given input. */
  step(input: InputState): void;
  /** Advance n steps using a scripted input timeline. */
  run(script: readonly InputSegment[], ticks: number): void;
  snapshot(): StateSnapshot;
  hash(): string;
  inputLog(): readonly InputFrame[];
  reset(seed?: number): void;
  /**
   * A save point at this tick. load() returns the sim to it exactly: the same inputs from there give the same states
   * and hashes as the run it was taken from, so bots can branch (the explorer's checkpoints). A save can be loaded
   * any number of times. Event counts carry over; the input log and the event history ring restart at a load (they
   * record one continuous run, and no system reads them).
   */
  save(): SimSave;
  load(save: SimSave): void;
  /**
   * How close the level is to being won, 0 to 1: the mean of what its systems report (those in options.progressFrom,
   * when set), or the closeness to the goal tile when none reports.
   */
  progress(): number;
}

class SimImpl implements Sim {
  world!: World;
  map!: Tilemap;
  events = new EventBus();
  rng!: Rng;
  tick = 0;
  private states = new Map<string, unknown>();
  private log: InputFrame[] = [];
  private lastInput: InputState = emptyInput();
  /** The previous step's input: key presses are edges against it. */
  private prevInput: InputState = emptyInput();
  private behaviours = new Map<string, BehaviourFsm>();
  private defs = new Map<string, EntityDef>();
  private unsubs: Array<() => void> = [];
  private pendingEvents: GameEventRecord[] = [];

  constructor(public readonly options: SimOptions) {
    for (const b of options.behaviours ?? []) this.behaviours.set(b.id, b);
    for (const d of options.entityDefs) this.defs.set(d.type, d);
    this.reset(options.seed);
  }

  reset(seed = this.options.seed): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.events = new EventBus();
    this.rng = new Rng(seed);
    this.tick = 0;
    this.log = [];
    this.lastInput = emptyInput();
    this.prevInput = emptyInput();
    this.map = new Tilemap(this.options.level);
    const lvl = this.options.level;
    const ts = lvl.tileSize;
    const playerDef: EntityDef = { type: 'player', w: this.options.player.w, h: this.options.player.h, hp: this.options.player.hp };
    const player = makeEntity(1, playerDef, lvl.spawn.x * ts, lvl.spawn.y * ts + (ts - playerDef.h));
    player.isPlayer = true;
    Object.assign(player.props, this.options.carry ?? {});
    this.world = {
      levelId: lvl.id,
      entities: [player],
      player,
      nextId: 2,
      hud: {},
      flags: { paused: false, gameOver: false, won: false },
      score: 0,
      deaths: 0,
      checkpoint: { x: player.x, y: player.y },
      menu: null,
    };
    for (const le of lvl.entities) {
      const def = this.defs.get(le.type);
      if (!def) continue;
      const e = this.spawn(le.type, le.x * ts, le.y * ts + (ts - def.h));
      Object.assign(e.props, le.props);
    }
    this.states.clear();
    const ctx = this.ctx('');
    for (const s of this.options.systems) this.states.set(s.id, s.init(this.ctx(s.id)));
    for (const s of this.options.systems) {
      if (!s.onEvent) continue;
      this.unsubs.push(this.events.on('*', (ev) => this.pendingEvents.push(ev)));
      break;
    }
    for (const rule of this.options.rules ?? []) {
      this.unsubs.push(this.events.on(rule.on, () => fireRule(rule, ctx)));
    }
    this.events.emit(0, 'level_start', { level: lvl.id });
  }

  private ctx(systemId: string): SimCtx {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get tick() {
        return self.tick;
      },
      dt: DT,
      get rng() {
        return self.rng;
      },
      get events() {
        return self.events;
      },
      get world() {
        return self.world;
      },
      get map() {
        return self.map;
      },
      feel: this.options.feel,
      params: this.options.params?.[systemId] ?? {},
      paramsOf: (id) => (this.options.systems.some((s) => s.id === id) ? (this.options.params?.[id] ?? {}) : undefined),
      content: this.options.content ?? {},
      movementMode: this.options.movementMode ?? 'platformer',
      defOf: (type) => this.defs.get(type),
      emit: (name, payload) => this.events.emit(this.tick, name, payload),
      spawn: (type, x, y) => this.spawn(type, x, y),
      damage: (target, amount, source) => this.damage(target, amount, source),
      respawnPlayer: () => this.respawnPlayer(),
      move: (e, dx, dy) => moveBody(this.map, e, dx, dy),
      openMenu: (menu) => this.openMenu(menu),
    };
  }

  /**
   * A progress hook's view of the game: every read a system has, but the game's rng and every action throw, so reading
   * progress (bots do, at every step) can never change what happens next.
   */
  private readCtx(systemId: string): SimCtx {
    const deny = (what: string) => (): never => {
      throw new Error(`system '${systemId}': progress() only reads the game; it cannot ${what}`);
    };
    const guard = <T extends object>(target: T, what: string, allowed: ReadonlySet<string>): T =>
      new Proxy(target, {
        get(t, key, receiver) {
          const v: unknown = Reflect.get(t, key, receiver);
          if (typeof v !== 'function') return v;
          return typeof key === 'string' && allowed.has(key) ? (v as (...a: unknown[]) => unknown).bind(t) : deny(what);
        },
      });
    const ctx = this.ctx(systemId);
    return {
      tick: this.tick,
      dt: DT,
      rng: guard(this.rng, 'draw from the rng', new Set()),
      events: guard(this.events, 'emit or subscribe to events', new Set(['count', 'history'])),
      world: this.world,
      map: this.map,
      feel: ctx.feel,
      params: ctx.params,
      paramsOf: ctx.paramsOf,
      content: ctx.content,
      movementMode: ctx.movementMode,
      defOf: ctx.defOf,
      emit: deny('emit events'),
      spawn: deny('spawn entities'),
      damage: deny('deal damage'),
      respawnPlayer: deny('respawn the player'),
      move: deny('move bodies'),
      openMenu: deny('open menus'),
    };
  }

  private openMenu(spec: MenuSpec): void {
    const options = spec.options.slice(0, MENU_MAX_OPTIONS).map((o) => ({ ...o }));
    if (options.length === 0) return;
    const firstEnabled = options.findIndex((o) => !o.disabled);
    let selected = Math.max(0, Math.min(options.length - 1, Math.floor(spec.selected ?? firstEnabled)));
    if (options[selected]!.disabled && firstEnabled >= 0) selected = firstEnabled;
    // A menu with nothing to pick can always be closed, so it never traps the player.
    const cancellable = (spec.cancellable ?? false) || firstEnabled < 0;
    this.world.menu = { id: spec.id, title: spec.title, options, selected, openedTick: this.tick, cancellable };
    this.events.emit(this.tick, 'menu_open', { menu: spec.id, options: options.map((o) => o.id) });
  }

  /** Arrows move the highlight (skipping disabled options, wrapping); action or jump picks; dash cancels if allowed. */
  private stepMenu(menu: Menu, input: InputState, prev: InputState): void {
    const pressed = (k: keyof InputState) => input[k] && !prev[k];
    const n = menu.options.length;
    const dir = (pressed('right') || pressed('down') ? 1 : 0) - (pressed('left') || pressed('up') ? 1 : 0);
    if (dir !== 0) {
      for (let i = 1; i < n; i++) {
        const j = (((menu.selected + dir * i) % n) + n) % n;
        if (!menu.options[j]!.disabled) {
          menu.selected = j;
          break;
        }
      }
    }
    if (this.tick - menu.openedTick < MENU_GRACE_TICKS) return;
    const opt = menu.options[menu.selected];
    if ((pressed('action') || pressed('jump')) && opt && !opt.disabled) {
      this.world.menu = null;
      this.events.emit(this.tick, 'menu_choose', { menu: menu.id, option: opt.id, index: menu.selected });
    } else if (menu.cancellable && pressed('dash')) {
      this.world.menu = null;
      this.events.emit(this.tick, 'menu_choose', { menu: menu.id, option: null, index: -1 });
    }
  }

  /** While the world is frozen (paused, or a menu is open) behaviour timers, cooldowns and hurt flashes hold still. */
  private holdTimers(): void {
    for (const e of this.world.entities) {
      if (e.tookDamageTick >= 0) e.tookDamageTick++;
      if (!e.fsm) continue;
      e.fsm.enteredTick++;
      for (const k of Object.keys(e.fsm.cooldowns)) e.fsm.cooldowns[k] = (e.fsm.cooldowns[k] ?? 0) + 1;
    }
  }

  spawn(type: string, x: number, y: number): Entity {
    const def = this.defs.get(type);
    if (!def) throw new Error(`unknown entity type '${type}'`);
    const e = makeEntity(this.world.nextId++, def, x, y);
    this.world.entities.push(e);
    this.events.emit(this.tick, 'spawn', { entity: e.id, type });
    return e;
  }

  damage(target: Entity, amount: number, source: Entity | null): void {
    if (!target.alive || target.invulnTicks > 0 || amount <= 0) return;
    target.hp -= amount;
    target.tookDamageTick = this.tick;
    target.invulnTicks = target.isPlayer ? 60 : 0;
    this.events.emit(this.tick, 'hit', { target: target.id, source: source?.id ?? null, amount });
    this.events.emit(this.tick, 'damage', { target: target.id, hp: target.hp });
    if (target.hp <= 0) {
      target.alive = false;
      this.events.emit(this.tick, 'death', { entity: target.id, type: target.type, x: target.x, y: target.y, level: this.world.levelId });
      if (target.isPlayer) this.world.deaths++;
    }
  }

  respawnPlayer(): void {
    const p = this.world.player;
    p.alive = true;
    p.hp = p.maxHp;
    p.x = this.world.checkpoint.x;
    p.y = this.world.checkpoint.y;
    p.vx = 0;
    p.vy = 0;
    p.invulnTicks = 60;
    this.events.emit(this.tick, 'spawn', { entity: p.id, type: 'player' });
  }

  step(input: InputState): void {
    if (!inputEquals(input, this.lastInput) || this.log.length === 0) {
      this.log.push({ tick: this.tick, input: { ...input } });
      this.lastInput = { ...input };
    }
    const prev = this.prevInput;
    this.prevInput = { ...input };
    const w = this.world;
    // An open menu holds the world still, even on a won level: a boon picked as the floor ends still carries over.
    if (w.menu) {
      this.stepMenu(w.menu, input, prev);
      this.dispatchEvents();
      this.holdTimers();
      this.tick++;
      return;
    }
    if (w.flags.won || w.flags.gameOver) {
      this.tick++;
      return;
    }
    if (input.pause && !prev.pause) w.flags.paused = !w.flags.paused;
    if (w.flags.paused) {
      this.holdTimers();
      this.tick++;
      return;
    }
    for (const s of this.options.systems) s.fixedUpdate(this.states.get(s.id), input, this.ctx(s.id));
    this.stepEntities();
    this.dispatchEvents();
    for (const e of w.entities) if (e.invulnTicks > 0) e.invulnTicks--;
    this.tick++;
  }

  private stepEntities(): void {
    const ctx = this.ctx('');
    const feel = this.options.feel;
    for (const e of this.world.entities) {
      if (!e.alive || e.isPlayer) continue;
      if (e.fsm) {
        const fsm = this.behaviours.get(e.fsm.id);
        if (fsm) stepFsm(fsm, e, ctx);
      }
      if (!e.alive) continue;
      if (e.gravity && (this.options.movementMode ?? 'platformer') === 'platformer') e.vy = Math.min(e.vy + feel.gravity * DT, feel.maxFall);
      moveBody(this.map, e, e.vx * DT, e.vy * DT);
      if (e.isProjectile) {
        if (e.hitWall || e.hitCeiling || e.grounded || e.x < -32 || e.x > this.map.pixelWidth + 32 || e.y > this.map.pixelHeight + 32) {
          e.alive = false;
          this.events.emit(this.tick, 'despawn', { entity: e.id, type: e.type });
          continue;
        }
      }
      const p = this.world.player;
      if (e.contactDamage > 0 && p.alive && overlaps(e, p)) {
        this.damage(p, e.contactDamage, e);
        if (e.isProjectile) {
          e.alive = false;
          this.events.emit(this.tick, 'despawn', { entity: e.id, type: e.type });
        }
      }
    }
    // Compact dead non-player entities.
    this.world.entities = this.world.entities.filter((e) => e.alive || e.isPlayer);
  }

  private dispatchEvents(): void {
    if (this.pendingEvents.length === 0) return;
    const batch = this.pendingEvents;
    this.pendingEvents = [];
    for (const s of this.options.systems) {
      if (!s.onEvent) continue;
      const ctx = this.ctx(s.id);
      for (const ev of batch) s.onEvent(this.states.get(s.id), ev, ctx);
    }
  }

  run(script: readonly InputSegment[], ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step(inputAtTick(script, this.tick));
  }

  snapshot(): StateSnapshot {
    const w = this.world;
    const p = w.player;
    const body = {
      tick: this.tick,
      scene: 'play',
      level: w.levelId,
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, hp: p.hp, grounded: p.grounded, facing: p.facing, alive: p.alive, anim: p.anim },
      entities: w.entities
        .filter((e) => !e.isPlayer)
        .map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, hp: e.hp, state: e.fsm?.state ?? null, anim: e.anim })),
      hud: { score: w.score, deaths: w.deaths, ...w.hud },
      rng: { seed: this.rng.seed, calls: this.rng.calls },
      flags: { ...w.flags },
      // Only while a menu is open, so the hash of every state without one is what it always was.
      ...(w.menu ? { menu: { id: w.menu.id, selected: w.menu.selected, options: w.menu.options.map((o) => o.id) } } : {}),
    };
    return { ...body, hash: hashValue(body) };
  }

  hash(): string {
    return this.snapshot().hash;
  }

  inputLog(): readonly InputFrame[] {
    return this.log;
  }

  progress(): number {
    if (this.world.flags.won) return 1;
    let sum = 0;
    let n = 0;
    const from = this.options.progressFrom;
    for (const s of this.options.systems) {
      if (!s.progress || (from && !from.includes(s.id))) continue;
      const v = s.progress(this.states.get(s.id), this.readCtx(s.id));
      if (!Number.isFinite(v)) continue;
      sum += Math.max(0, Math.min(1, v));
      n++;
    }
    return n > 0 ? sum / n : goalCloseness(this.map, this.world.player);
  }

  save(): SimSave {
    // One clone for the world and the system states keeps references between them (a state holding an entity) intact.
    const live = structuredClone({ world: this.world, states: [...this.states.entries()], pending: this.pendingEvents });
    const data: SaveData = {
      ...live,
      tiles: this.map.saveTiles(),
      rng: this.rng.getState(),
      events: this.events.saveCounts(),
      lastInput: { ...this.lastInput },
      prevInput: { ...this.prevInput },
    };
    return { tick: this.tick, data };
  }

  load(save: SimSave): void {
    const d = save.data as SaveData;
    // Clone again on the way in, so the save stays untouched for the next load.
    const live = structuredClone({ world: d.world, states: d.states, pending: d.pending });
    this.world = live.world;
    this.states = new Map(live.states);
    this.pendingEvents = live.pending;
    this.map.restoreTiles(d.tiles);
    this.rng.setState(d.rng);
    this.events.restoreCounts(d.events);
    this.lastInput = { ...d.lastInput };
    this.prevInput = { ...d.prevInput };
    this.tick = save.tick;
    this.log = [];
  }
}

/** 1 at the goal tile, 0 as far from it as the spawn is (or further). */
export function goalCloseness(map: Tilemap, p: Entity): number {
  const ts = map.tileSize;
  const lvl = map.level;
  const start = Math.hypot(lvl.spawn.x - lvl.goal.x, lvl.spawn.y - lvl.goal.y) || 1;
  const d = Math.hypot((p.x + p.w / 2) / ts - (lvl.goal.x + 0.5), (p.y + p.h / 2) / ts - (lvl.goal.y + 0.5));
  return Math.max(0, Math.min(1, 1 - d / start));
}

/** The seed a game plays with unless the page asks for another (the play page passes none). */
export const DEFAULT_SEED = 1;

/**
 * The seed level `index` runs with when the game plays at `seed`: every level its own, the same on every retry. Every
 * proof of a level (solver bots, the explorer, recorded runs) runs at the seed players get: levelSeed(DEFAULT_SEED, i).
 */
export function levelSeed(seed: number, index: number): number {
  return seed + index;
}

export function createSim(options: SimOptions): Sim {
  return new SimImpl(options);
}

/** Fresh sim from the same options, run under a script: the replay oracle. */
export function replay(options: SimOptions, script: readonly InputSegment[], ticks: number, seed = options.seed): StateSnapshot {
  const sim = createSim({ ...options, seed });
  sim.run(script, ticks);
  return sim.snapshot();
}
