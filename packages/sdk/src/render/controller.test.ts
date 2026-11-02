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

describe('GameController ending', () => {
  const story = {
    version: 1,
    nodes: [{ id: 'epilogue', speaker: 'narrator', lines: ['And so it ended.'] }],
    starts: [{ speaker: 'nobody', node: 'epilogue' }],
    endings: [{ id: 'only', title: 'The End', node: 'epilogue' }],
  };
  const winsAt10 = defineSystem<null>({
    id: 'wins',
    init: () => null,
    fixedUpdate(_s, _input, ctx) {
      if (ctx.tick === 10) ctx.world.flags.won = true;
    },
  });
  const game = (levels: LevelJson[]) =>
    new GameController({
      levels,
      simOptions: { feel: CELESTE_CLASS, systems: [winsAt10], entityDefs: [], player: { w: 8, h: 8, hp: 3 }, movementMode: 'topdown', content: { dialogue: story } },
      seed: 1,
      mode: 'manual',
      build: { gameId: 'test', versionId: 'v', engine: 'test' },
    });

  it('ends the game as its last level is won: the ending the flags reach, its epilogue read before the results', () => {
    const c = game([room('a'), room('b')]);
    c.setScene('play');
    // The first level is not the last: no ending there (it is won at tick 10, and the next starts 90 ticks later).
    c.step(120);
    expect([c.levelIndex, c.sim.world.ending ?? null]).toEqual([1, null]);
    c.step(60);
    expect([c.sim.world.ending?.id, c.sim.world.dialogue?.node]).toEqual(['only', 'epilogue']);
    // Unread, it waits.
    c.step(300);
    expect([c.scene, c.sim.world.dialogue?.node]).toEqual(['play', 'epilogue']);
    play(c, 2);
    expect(c.sim.world.dialogue ?? null).toBeNull();
    c.step(30);
    expect(c.scene).toBe('play');
    c.step(30);
    expect([c.scene, c.sim.world.ending?.title]).toEqual(['results', 'The End']);
  });

  it('never ends a scripted run: the determinism oracle holds the won level as it always has', async () => {
    const c = game([room('a')]);
    c.setScene('play');
    await c.runScript([{ from: 0, to: 200, input: {} }], 200);
    expect([c.sim.world.flags.won, c.sim.world.ending ?? null, c.sim.world.dialogue ?? null]).toEqual([true, null, null]);
  });
});

describe('GameController chapters', () => {
  const story = {
    version: 1,
    nodes: [
      { id: 'prologue', speaker: 'narrator', lines: ['It began in the dark.'], next: 'prologue-2' },
      { id: 'prologue-2', speaker: 'narrator', lines: ['Then a light.'] },
      { id: 'second', speaker: 'narrator', lines: ['The second hall.'] },
    ],
    chapters: [
      { level: 1, title: 'The Dark', node: 'prologue' },
      { level: 2, title: 'The Light', node: 'second' },
    ],
  };
  const winsAt10 = defineSystem<null>({
    id: 'wins',
    init: () => null,
    fixedUpdate(_s, _input, ctx) {
      if (ctx.tick === 10) ctx.world.flags.won = true;
    },
  });
  const game = (mode: 'realtime' | 'manual', dialogue: unknown = story) =>
    new GameController({
      levels: [room('a'), room('b')],
      simOptions: { feel: CELESTE_CLASS, systems: [winsAt10], entityDefs: [], player: { w: 8, h: 8, hp: 3 }, movementMode: 'topdown', content: { dialogue } },
      seed: 1,
      mode,
      build: { gameId: 'test', versionId: 'v', engine: 'test' },
    });
  /** A keyboard the test presses, the way the browser reports keys. */
  const keys = (c: GameController) => {
    const on: Record<string, (e: KeyboardEvent) => void> = {};
    c.keyboard.attach({ addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => void (on[type] = fn), removeEventListener() {} } as unknown as Window);
    const ev = (code: string) => ({ code, preventDefault() {} }) as KeyboardEvent;
    return { down: (code: string) => on['keydown']!(ev(code)), up: (code: string) => on['keyup']!(ev(code)) };
  };
  /** Rendered frames, one sim tick each. */
  const frames = (c: GameController, n: number) => {
    for (let i = 0; i < n; i++) c.frame(1000 / 60);
  };
  const tap = (c: GameController, k: ReturnType<typeof keys>, code: string) => {
    k.down(code);
    frames(c, 1);
    k.up(code);
    frames(c, 1);
  };

  it('reads the first chapter before the first level begins, the level waiting at its first tick', () => {
    const c = game('realtime');
    const k = keys(c);
    c.setScene('title');
    // Enter starts the game, and is still held as the narration opens: holding it reads nothing on.
    k.down('Enter');
    c.begin();
    expect([c.scene, c.narration?.node, c.narration?.name]).toEqual(['story', 'prologue', '']);
    frames(c, 60);
    expect([c.narration?.node, c.narration?.shown, c.sim.tick]).toEqual(['prologue', 'It began in the dark.'.length, 0]);
    k.up('Enter');
    frames(c, 1);
    tap(c, k, 'Enter');
    // Its node goes on to the next, read the same way.
    expect(c.narration?.node).toBe('prologue-2');
    frames(c, 30);
    k.down('Space');
    frames(c, 1);
    // Read: the level begins at its first tick, and plays on from there.
    expect([c.scene, c.narration, c.sim.tick]).toEqual(['play', null, 0]);
    k.up('Space');
    frames(c, 5);
    expect(c.sim.tick).toBe(5);
    expect([c.chapterTitle(0), c.chapterTitle(1)]).toEqual(['The Dark', 'The Light']);
  });

  it('reads the next chapter as its level comes up', () => {
    const c = game('realtime');
    const k = keys(c);
    c.begin();
    frames(c, 30);
    tap(c, k, 'Enter');
    frames(c, 30);
    tap(c, k, 'Enter');
    // Won at tick 10; the next level starts 90 ticks later, behind its chapter.
    frames(c, 110);
    expect([c.levelIndex, c.scene, c.narration?.node, c.sim.tick]).toEqual([1, 'story', 'second', 0]);
  });

  it('never narrates for manual stepping, a script, a Continue or a game without chapters', async () => {
    const manual = game('manual');
    manual.begin();
    expect([manual.scene, manual.narration]).toEqual(['play', null]);
    const scripted = game('realtime');
    const done = scripted.runScript([{ from: 0, to: 30, input: {} }], 30);
    frames(scripted, 40);
    await done;
    scripted.begin();
    expect(scripted.scene).toBe('play');
    const resumed = game('realtime');
    resumed.loadLevel(0, 1, {}, { at: { x: 16, y: 24 }, props: {}, removed: [], tiles: [] });
    resumed.begin();
    expect(resumed.scene).toBe('play');
    const plain = game('realtime', { version: 1, nodes: [{ id: 'n', speaker: 'narrator', lines: ['x'] }] });
    plain.begin();
    expect([plain.scene, plain.chapterTitle(0)]).toEqual(['play', null]);
  });
});

describe('GameController saves', () => {
  it('picks a level up from a save, and starts it at its start for a script or a retry', () => {
    const c = make(grant);
    c.loadLevel(1, 1, { power: 3 }, { at: { x: 40, y: 16 }, facing: -1, props: { power: 5 }, removed: [], tiles: [] });
    const p = c.sim.world.player;
    expect([c.level.id, p.x, p.y, p.facing]).toEqual(['b', 40, 16, -1]);
    // The save's props over what the level began with (and the level's own grant on top).
    expect(power(c)).toBe(6);
    // The determinism oracle replays the level from its start, as the proofs play it.
    void c.runScript([], 3);
    expect(c.resume).toBeNull();
    expect([c.sim.world.player.x, power(c)]).toEqual([16, 4]);
  });
});
