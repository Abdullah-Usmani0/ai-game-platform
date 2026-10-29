import type { LevelJson, ParamValue } from '@gg/schemas';
import { createSim, emptyInput, type InputState } from '@gg/sdk';
import { runBot } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { BOONS, WARDEN } from './index.js';
import { topdownAction } from './node.js';

function simFor(seed: number, difficulty: number, simSeed = 1, extra: { boss?: number; carry?: Record<string, ParamValue> } = {}) {
  const level = topdownAction.levelGrammar.generate({ seed, difficulty, boss: extra.boss ?? 0 });
  return simOn(level, simSeed, extra.carry);
}

function simOn(level: LevelJson, simSeed = 1, carry?: Record<string, ParamValue>) {
  return createSim({
    level,
    feel: topdownAction.feelPresets[topdownAction.defaultFeel]!,
    seed: simSeed,
    systems: Object.values(topdownAction.systems).map((m) => m.create()),
    entityDefs: topdownAction.entityDefs,
    player: topdownAction.player,
    behaviours: topdownAction.defaultBehaviours,
    params: { 'movement-topdown': { dashInvuln: true } },
    content: {},
    movementMode: 'topdown',
    carry,
  });
}

/** An open room with one target in it: the player at the left, a sleeping brute (6 hp) to its right. */
function arena(enemy = 'brute', ex = 9): LevelJson {
  const rows = ['####################', ...Array.from({ length: 8 }, () => '#..................#'), '####################'];
  return { version: 1, id: 'arena', name: 'Arena', tileSize: 8, width: 20, height: 10, legend: { '.': 'air', '#': 'solid', G: 'goal' }, rows, entities: [{ type: enemy, x: ex, y: 5, props: {} }], spawn: { x: 3, y: 5 }, goal: { x: 17, y: 5 } };
}
const press = (over: Partial<InputState>): InputState => ({ ...emptyInput(), ...over });

describe('topdown-action template', () => {
  it('generates rooms the validator accepts across difficulties', () => {
    for (const difficulty of [0.1, 0.35, 0.6, 0.9]) {
      for (let seed = 1; seed <= 4; seed++) {
        const level = topdownAction.levelGrammar.generate({ seed, difficulty });
        const r = topdownAction.levelGrammar.validate(level, topdownAction.feelPresets['room-melee']!);
        expect(r.issues.filter((i) => i.severity === 'error'), `seed ${seed} d ${difficulty}`).toEqual([]);
        expect(r.metrics['enemies']).toBeGreaterThan(0);
      }
    }
    const hard = topdownAction.levelGrammar.generate({ seed: 3, difficulty: 0.9 });
    expect(hard.entities.some((e) => e.type === 'archer')).toBe(true);
  });

  it('the clearer wins easy floors with kills; the coward cannot pass the locked exit; afk never finishes', () => {
    let wins = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const win = runBot(simFor(seed, 0.2), topdownAction.bots['clearer']!, 90 * 60);
      if (!win.completed) continue;
      wins++;
      expect(win.events['hit']).toBeGreaterThan(0);
      expect(win.events['death']).toBeGreaterThan(0);
      const coward = runBot(simFor(seed, 0.2), topdownAction.bots['coward']!, 60 * 60);
      expect(coward.completed).toBe(false);
    }
    expect(wins, 'clearer wins on most easy seeds').toBeGreaterThanOrEqual(4);
    const afk = runBot(simFor(2, 0.5), topdownAction.bots['afk']!, 60 * 60);
    expect(afk.completed).toBe(false);
  });

  it('archers shoot arrows once the clearer engages them', () => {
    const level = topdownAction.levelGrammar.generate({ seed: 5, difficulty: 0.7 });
    expect(level.entities.some((e) => e.type === 'archer')).toBe(true);
    const r = runBot(simFor(5, 0.7), topdownAction.bots['clearer']!, 90 * 60);
    expect(r.events['spawn']).toBeGreaterThan(level.entities.length);
  });

  it('is deterministic under the chaos bot', () => {
    const a = runBot(simFor(9, 0.6), topdownAction.bots['chaos']!, 1500);
    const b = runBot(simFor(9, 0.6), topdownAction.bots['chaos']!, 1500);
    expect(a.finalHash).toBe(b.finalHash);
  });

  it('chains swings into a heavier finisher, and a swing out of a dash lunges', () => {
    const sim = simOn(arena('brute', 5));
    const kinds: string[] = [];
    sim.events.on('custom:swing', (ev) => kinds.push(String(ev.payload['kind'])));
    for (let t = 0; t < 80; t++) sim.step(press({ action: true }));
    expect(kinds.slice(0, 4)).toEqual(['swing', 'swing', 'finisher', 'swing']);
    expect(sim.events.count('custom:finisher')).toBeGreaterThan(0);
    const dash = simOn(arena('brute', 7));
    const lunges: string[] = [];
    dash.events.on('custom:swing', (ev) => lunges.push(String(ev.payload['kind'])));
    dash.step(press({ right: true, dash: true }));
    for (let t = 0; t < 4; t++) dash.step(press({ right: true }));
    dash.step(press({ right: true, action: true }));
    expect(lunges).toEqual(['lunge']);
  });

  it('the dash makes the player untouchable while it lasts', () => {
    const sim = simOn(arena('grunt', 12));
    const p = sim.world.player;
    sim.step(press({ right: true, dash: true }));
    expect(p.flags['dashing']).toBe(true);
    expect(p.invulnTicks).toBeGreaterThan(0);
    const hp = p.hp;
    sim.events.emit(sim.tick, 'noop');
    for (const e of sim.world.entities) if (!e.isPlayer) e.contactDamage = 5;
    // A hit during the dash does nothing.
    const grunt = sim.world.entities.find((e) => e.type === 'grunt')!;
    grunt.x = p.x;
    grunt.y = p.y;
    sim.step(press({ right: true }));
    expect(p.hp).toBe(hp);
  });

  it('offers three different boons after a floor; the pick changes the player and carries over', () => {
    const sim = simFor(1, 0.2);
    const r = runBot(sim, topdownAction.bots['clearer']!, 90 * 60);
    expect(r.completed).toBe(true);
    const open = sim.events.history().find((e) => e.name === 'menu_open')!;
    const offered = open.payload['options'] as string[];
    expect(new Set(offered).size).toBe(3);
    expect(offered.every((id) => BOONS.some((b) => b.id === id))).toBe(true);
    const chosen = String(sim.events.history().find((e) => e.name === 'custom:boon')!.payload['boon']);
    expect(chosen).toBe(offered[0]);
    expect(sim.world.player.props[`boon_${chosen}`]).toBe(1);
    // The next floor starts with it: Stout Heart's hearts come back with the carried props.
    const next = simFor(2, 0.3, 1, { carry: { maxHpBonus: 2, boon_heart: 1 } });
    expect(next.world.player.maxHp).toBe(topdownAction.player.hp + 2);
    expect(next.world.hud['boons']).toBe(1);
  });

  it('a boss floor puts the warden alone in a dead-end lair; it can be beaten and offers no boon after', () => {
    let wins = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const level = topdownAction.levelGrammar.generate({ seed, difficulty: 0.5, boss: 1 });
      const report = topdownAction.levelGrammar.validate(level, topdownAction.feelPresets['room-melee']!);
      expect(report.issues.filter((i) => i.severity === 'error'), `seed ${seed}`).toEqual([]);
      expect(report.metrics['bosses']).toBe(1);
      const sim = simOn(level);
      const r = runBot(sim, topdownAction.bots['clearer']!, 120 * 60);
      if (!r.completed) continue;
      wins++;
      expect(sim.events.history().some((e) => e.name === 'death' && e.payload['type'] === 'warden')).toBe(true);
      expect(sim.events.count('menu_open')).toBe(0);
    }
    expect(wins, 'the clearer beats the warden on most seeds').toBeGreaterThanOrEqual(4);
  });

  it('the warden sleeps until it sees the player, enrages below half health, and rings its embers', () => {
    const sim = simOn(arena('warden', 13));
    const warden = sim.world.entities.find((e) => e.type === 'warden')!;
    for (let t = 0; t < 30; t++) sim.step(emptyInput());
    expect(warden.fsm?.state).toBe('wait');
    // Put a wall between them: still asleep at close range.
    sim.map.setKind(8, 4, 'solid');
    sim.map.setKind(8, 5, 'solid');
    sim.map.setKind(8, 6, 'solid');
    sim.world.player.x = 6 * 8;
    for (let t = 0; t < 10; t++) sim.step(emptyInput());
    expect(warden.fsm?.state).toBe('wait');
    for (const y of [4, 5, 6]) sim.map.setKind(8, y, 'air');
    for (let t = 0; t < 5; t++) sim.step(emptyInput());
    expect(warden.fsm?.state).toBe('stalk');
    warden.hp = 14;
    let embers = 0;
    sim.events.on('spawn', (ev) => {
      if (ev.payload['type'] === 'ember') embers++;
    });
    for (let t = 0; t < 30 && !warden.flags['enraged']; t++) sim.step(emptyInput());
    expect(warden.flags['enraged']).toBe(true);
    const roar = WARDEN.states['roar']!.onEnter.find((a) => a.kind === 'shoot_ring');
    expect(embers).toBe(roar?.kind === 'shoot_ring' ? roar.count : -1);
  });
});
