import type { LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { CELESTE_CLASS } from '../sim/feel.js';
import { defineSystem, type SystemDef } from '../sim/system.js';
import { GameController } from './controller.js';

const room = (id: string): LevelJson => ({
  version: 1,
  id,
  name: id,
  tileSize: 8,
  width: 12,
  height: 6,
  legend: { '.': 'air', '#': 'solid' },
  rows: ['############', '#..........#', '#..........#', '#..........#', '#..........#', '############'],
  entities: [],
  spawn: { x: 2, y: 3 },
  goal: { x: 9, y: 3 },
});

/** Every level grants one power as it starts and offers a boon on tick 5 that doubles it; the level is won on tick 30. */
const grant = defineSystem<null>({
  id: 'grant',
  init(ctx) {
    const p = ctx.world.player;
    p.props['power'] = Number(p.props['power'] ?? 0) + 1;
    return null;
  },
  fixedUpdate(_s, _input, ctx) {
    if (ctx.tick === 5) ctx.openMenu({ id: 'boon', title: 'Boon', options: [{ id: 'double', label: 'Double' }] });
    if (ctx.tick === 30) ctx.world.flags.won = true;
  },
  onEvent(_s, ev, ctx) {
    if (ev.name === 'menu_choose' && ev.payload['option'] === 'double') ctx.world.player.props['power'] = Number(ctx.world.player.props['power']) * 2;
  },
});

const make = (system: SystemDef<null>) =>
  new GameController({
    levels: [room('a'), room('b'), room('c')],
    simOptions: { feel: CELESTE_CLASS, systems: [system], entityDefs: [], player: { w: 8, h: 8, hp: 3 }, movementMode: 'topdown' },
    seed: 1,
    mode: 'manual',
    build: { gameId: 'test', versionId: 'v', engine: 'test' },
  });

/** Step with the action key pressed on every other tick (which picks any open menu once its grace is over). */
function play(c: GameController, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    c.setInput({ action: c.sim.tick % 2 === 0 });
    c.step(1);
  }
}

const power = (c: GameController) => c.sim.world.player.props['power'];

describe('GameController level sequencing', () => {
  it('carries the player props into the next level, keeps them for a retry and clears them on reset', () => {
    const c = make(grant);
    c.setScene('play');
    expect(power(c)).toBe(1);
    play(c, 40);
    expect(power(c)).toBe(2);
    play(c, 100);
    expect(c.levelIndex).toBe(1);
    expect(c.carry).toEqual({ power: 2 });
    expect(power(c)).toBe(3);
    play(c, 40);
    expect(power(c)).toBe(6);
    // A retry starts the level with what it started with, not with what was earned since.
    c.loadLevel(c.levelIndex);
    expect(power(c)).toBe(3);
    c.reset();
    expect(c.levelIndex).toBe(0);
    expect(c.carry).toEqual({});
    expect(power(c)).toBe(1);
  });

  it('does not move on while a menu is open on a won level', () => {
    const winAndOffer = defineSystem<null>({
      id: 'win-and-offer',
      init: () => null,
      fixedUpdate(_s, _input, ctx) {
        if (ctx.tick !== 5) return;
        ctx.world.flags.won = true;
        ctx.openMenu({ id: 'boon', title: 'Boon', options: [{ id: 'keep', label: 'Keep' }] });
      },
      onEvent(_s, ev, ctx) {
        if (ev.name === 'menu_choose') ctx.world.player.props['kept'] = true;
      },
    });
    const c = make(winAndOffer);
    c.setScene('play');
    c.step(300);
    expect(c.levelIndex).toBe(0);
    expect(c.sim.world.menu?.id).toBe('boon');
    play(c, 4);
    expect(c.sim.world.menu).toBeNull();
    const pickedAt = c.sim.events.history().find((e) => e.name === 'menu_choose')!.tick;
    expect(pickedAt).toBeGreaterThanOrEqual(300);
    // The usual 90-tick pause before the next level starts at the pick.
    c.step(pickedAt + 90 - c.sim.tick);
    expect(c.levelIndex).toBe(0);
    c.step(1);
    expect(c.levelIndex).toBe(1);
    expect(c.carry).toEqual({ kept: true });
  });
});
