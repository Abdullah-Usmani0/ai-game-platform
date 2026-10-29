import type { BehaviourFsm, EcaRule, GameEventRecord, LevelJson, ParamValue, StateSnapshot } from '@gg/schemas';
import { EventBus } from './events.js';
import type { FeelPreset } from './feel.js';
import { fireRule, stepFsm } from './fsm.js';
import { hashValue } from './hash.js';
import { emptyInput, inputAtTick, inputEquals, type InputFrame, type InputSegment, type InputState } from './input.js';
import { moveBody, overlaps } from './physics.js';
import { Rng } from './rng.js';
import type { SimCtx, SystemDef } from './system.js';
import { Tilemap } from './tilemap.js';
import { makeEntity, type Entity, type EntityDef, type World } from './world.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

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
    this.map = new Tilemap(this.options.level);
    const lvl = this.options.level;
    const ts = lvl.tileSize;
    const playerDef: EntityDef = { type: 'player', w: this.options.player.w, h: this.options.player.h, hp: this.options.player.hp };
    const player = makeEntity(1, playerDef, lvl.spawn.x * ts, lvl.spawn.y * ts + (ts - playerDef.h));
    player.isPlayer = true;
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
      content: this.options.content ?? {},
      movementMode: this.options.movementMode ?? 'platformer',
      emit: (name, payload) => this.events.emit(this.tick, name, payload),
      spawn: (type, x, y) => this.spawn(type, x, y),
      damage: (target, amount, source) => this.damage(target, amount, source),
      respawnPlayer: () => this.respawnPlayer(),
      move: (e, dx, dy) => moveBody(this.map, e, dx, dy),
    };
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
    const w = this.world;
    if (w.flags.won || w.flags.gameOver) {
      this.tick++;
      return;
    }
    if (input.pause && !this.lastPause) w.flags.paused = !w.flags.paused;
    this.lastPause = input.pause;
    if (w.flags.paused) {
      this.tick++;
      return;
    }
    for (const s of this.options.systems) s.fixedUpdate(this.states.get(s.id), input, this.ctx(s.id));
    this.stepEntities();
    this.dispatchEvents();
    for (const e of w.entities) if (e.invulnTicks > 0) e.invulnTicks--;
    this.tick++;
  }
  private lastPause = false;

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
    };
    return { ...body, hash: hashValue(body) };
  }

  hash(): string {
    return this.snapshot().hash;
  }

  inputLog(): readonly InputFrame[] {
    return this.log;
  }
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
