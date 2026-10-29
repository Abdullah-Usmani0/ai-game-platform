import type { WaveTable } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { BASE_MANIFESTS } from './node.js';
import { CURATED_IDS, RUNTIMES } from './registry.js';
import { inverse, retypeContent, retypeFsm, retypeLevel, retypeObjectives } from './retype.js';

describe('retype', () => {
  it('renames every type a level, its waves and its behaviours name, and renames them back', () => {
    for (const g of CURATED_IDS) {
      const m = BASE_MANIFESTS[g];
      const rename = new Map(RUNTIMES[g].entityDefs.map((d) => [d.type, `my-${d.type}`]));
      const back = inverse(rename);
      for (const params of [{ seed: 1, difficulty: 0.3 }, { seed: 2, difficulty: 0.7 }]) {
        const level = m.levelGrammar.generate(params);
        const there = retypeLevel(level, rename);
        expect(there.entities.every((e) => e.type.startsWith('my-')), g).toBe(true);
        expect(retypeLevel(there, back), g).toEqual(level);
        const content = m.extraContent?.(params) ?? {};
        const waves = retypeContent(content, rename)['waves'] as WaveTable | undefined;
        if (waves) expect(waves.waves.flatMap((w) => w.spawns).every((s) => s.enemy.startsWith('my-')), g).toBe(true);
        expect(retypeContent(retypeContent(content, rename), back), g).toEqual(content);
      }
      for (const fsm of RUNTIMES[g].defaultBehaviours) {
        const there = retypeFsm(fsm, rename);
        expect(retypeFsm(there, back), `${g}/${fsm.id}`).toEqual(fsm);
        expect(JSON.stringify(there).match(/"projectile":"(?!my-)/), `${g}/${fsm.id}`).toBeNull();
      }
    }
  });

  it('renames the types objectives count', () => {
    const o = retypeObjectives({ version: 1, win: { mode: 'all', clauses: [{ kind: 'defeat', type: 'chaser', count: 5 }, { kind: 'collect', count: 2 }, { kind: 'reach_goal' }] }, lose: [] }, new Map([['chaser', 'wasp']]));
    expect(o.win.clauses).toEqual([{ kind: 'defeat', type: 'wasp', count: 5 }, { kind: 'collect', count: 2 }, { kind: 'reach_goal' }]);
  });
});
