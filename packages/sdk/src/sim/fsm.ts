import type { Action, BehaviourFsm, Condition, EcaRule, LeafCondition } from '@gg/schemas';
import { overlaps } from './physics.js';
import type { SimCtx } from './system.js';
import { centerX, centerY, type Entity } from './world.js';

const TICK_MS = 1000 / 60;

function distanceToPlayer(e: Entity, ctx: SimCtx): number {
  const p = ctx.world.player;
  return Math.hypot(centerX(p) - centerX(e), centerY(p) - centerY(e));
}

/** True when no solid tile lies on the straight line between the entity's centre and the player's (tile steps). */
export function inSight(e: Entity, ctx: SimCtx): boolean {
  const p = ctx.world.player;
  const ts = ctx.map.tileSize;
  const x0 = centerX(e);
  const y0 = centerY(e);
  const dx = centerX(p) - x0;
  const dy = centerY(p) - y0;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (ts / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (ctx.map.kindAtPx(x0 + dx * t, y0 + dy * t) === 'solid') return false;
  }
  return true;
}

function atLedge(e: Entity, ctx: SimCtx): boolean {
  if (!e.grounded) return false;
  const aheadX = e.facing > 0 ? e.x + e.w + 1 : e.x - 1;
  const belowY = e.y + e.h + 1;
  const kind = ctx.map.kindAtPx(aheadX, belowY);
  return kind === 'air' || kind === 'hazard';
}

export function evalLeaf(c: LeafCondition, e: Entity, ctx: SimCtx): boolean {
  switch (c.kind) {
    case 'always':
      return true;
    case 'timer_elapsed':
      return e.fsm !== null && (ctx.tick - e.fsm.enteredTick) * TICK_MS >= c.ms;
    case 'player_within':
      return distanceToPlayer(e, ctx) <= c.px;
    case 'player_beyond':
      return distanceToPlayer(e, ctx) > c.px;
    case 'player_in_sight':
      return distanceToPlayer(e, ctx) <= c.px && inSight(e, ctx);
    case 'hp_below':
      return e.maxHp > 0 && e.hp / e.maxHp < c.fraction;
    case 'hit_wall':
      return e.hitWall;
    case 'at_ledge':
      return atLedge(e, ctx);
    case 'grounded':
      return e.grounded;
    case 'took_damage':
      // Hit this tick or the last (never-hit entities hold -1, which must not read as a hit on tick 0).
      return e.tookDamageTick >= 0 && e.tookDamageTick >= ctx.tick - 1;
    case 'flag':
      return (e.flags[c.name] ?? false) === c.is;
    case 'chance':
      return ctx.rng.chance(c.p);
  }
}

export function evalCondition(c: Condition, e: Entity, ctx: SimCtx): boolean {
  if (c.kind === 'all') return c.of.every((leaf) => evalLeaf(leaf, e, ctx));
  if (c.kind === 'any') return c.of.some((leaf) => evalLeaf(leaf, e, ctx));
  return evalLeaf(c, e, ctx);
}

export function applyAction(a: Action, e: Entity, ctx: SimCtx): void {
  const p = ctx.world.player;
  switch (a.kind) {
    case 'idle':
      e.vx = 0;
      return;
    case 'patrol':
      if (e.hitWall || atLedge(e, ctx)) e.facing = -e.facing;
      e.vx = e.facing * a.speed;
      return;
    case 'move_toward_player':
    case 'move_away_from_player': {
      const sign = a.kind === 'move_toward_player' ? 1 : -1;
      const dx = centerX(p) - centerX(e);
      const dy = centerY(p) - centerY(e);
      e.facing = dx >= 0 ? sign : -sign;
      if (ctx.movementMode === 'topdown') {
        const len = Math.hypot(dx, dy) || 1;
        e.vx = (sign * dx * a.speed) / len;
        e.vy = (sign * dy * a.speed) / len;
      } else {
        e.vx = e.facing * a.speed;
      }
      return;
    }
    case 'jump':
      if (e.grounded) e.vy = a.vy;
      return;
    case 'set_velocity':
      e.vx = a.vx;
      e.vy = a.vy;
      return;
    case 'shoot': {
      if (!e.fsm) return;
      const readyAt = e.fsm.cooldowns[a.projectile] ?? -1;
      if (ctx.tick < readyAt) return;
      e.fsm.cooldowns[a.projectile] = ctx.tick + Math.ceil(a.cooldownMs / TICK_MS);
      if (ctx.movementMode === 'topdown') {
        // Aimed at the player; spawned just outside the shooter's body.
        const dx = centerX(p) - centerX(e);
        const dy = centerY(p) - centerY(e);
        const len = Math.hypot(dx, dy) || 1;
        const proj = ctx.spawn(a.projectile, centerX(e) - 2 + (dx / len) * (e.w / 2 + 3), centerY(e) - 2 + (dy / len) * (e.h / 2 + 3));
        proj.vx = (dx / len) * a.speed;
        proj.vy = (dy / len) * a.speed;
        proj.facing = dx >= 0 ? 1 : -1;
        e.facing = proj.facing;
        return;
      }
      const proj = ctx.spawn(a.projectile, e.facing > 0 ? e.x + e.w : e.x - 4, centerY(e) - 2);
      proj.vx = e.facing * a.speed;
      proj.facing = e.facing;
      return;
    }
    case 'shoot_ring': {
      if (!e.fsm) return;
      const key = `ring:${a.projectile}`;
      if (ctx.tick < (e.fsm.cooldowns[key] ?? -1)) return;
      e.fsm.cooldowns[key] = ctx.tick + Math.ceil(a.cooldownMs / TICK_MS);
      // One projectile points at the player; every other ring is turned half a step, so standing still never works twice.
      const rings = Number(e.props['rings'] ?? 0);
      e.props['rings'] = rings + 1;
      const step = (Math.PI * 2) / a.count;
      const aim = Math.atan2(centerY(p) - centerY(e), centerX(p) - centerX(e)) + (rings % 2) * (step / 2);
      for (let i = 0; i < a.count; i++) {
        const ang = aim + i * step;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const proj = ctx.spawn(a.projectile, centerX(e) - 2 + dx * (e.w / 2 + 2), centerY(e) - 2 + dy * (e.h / 2 + 2));
        proj.vx = dx * a.speed;
        proj.vy = dy * a.speed;
        proj.facing = dx >= 0 ? 1 : -1;
      }
      return;
    }
    case 'play_anim':
      e.anim = a.anim;
      return;
    case 'emit':
      ctx.emit(a.event, { entity: e.id, type: e.type });
      return;
    case 'set_flag':
      e.flags[a.name] = a.value;
      return;
    case 'turn_around':
      e.facing = -e.facing;
      return;
    case 'damage_player':
      if (a.radius !== undefined ? distanceToPlayer(e, ctx) <= a.radius : overlaps(e, p)) ctx.damage(p, a.amount, e);
      return;
    case 'despawn':
      e.alive = false;
      ctx.emit('despawn', { entity: e.id, type: e.type });
      return;
  }
}

/** Advance one entity's FSM by one tick: at most one transition, then the state's update actions. */
export function stepFsm(fsm: BehaviourFsm, e: Entity, ctx: SimCtx): void {
  const rt = e.fsm;
  if (!rt) return;
  if (rt.state === '') {
    rt.state = fsm.initial;
    rt.enteredTick = ctx.tick;
    for (const a of fsm.states[rt.state]?.onEnter ?? []) applyAction(a, e, ctx);
  }
  const current = fsm.states[rt.state];
  if (!current) return;
  for (const t of current.transitions) {
    if (evalCondition(t.when, e, ctx)) {
      rt.state = t.to;
      rt.enteredTick = ctx.tick;
      for (const a of fsm.states[t.to]?.onEnter ?? []) applyAction(a, e, ctx);
      break;
    }
  }
  const st = fsm.states[rt.state];
  if (!st) return;
  for (const a of st.update) {
    if (!e.alive) break;
    applyAction(a, e, ctx);
  }
}

/** Fire an ECA rule's actions on the player when its conditions (evaluated on the player) hold. */
export function fireRule(rule: EcaRule, ctx: SimCtx): boolean {
  const p = ctx.world.player;
  for (const c of rule.if) if (!evalLeaf(c, p, ctx)) return false;
  for (const a of rule.do) applyAction(a, p, ctx);
  return true;
}
