import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_SCHEMAS } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { checkSystems } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { runBot } from '@gg/template-core';
import { CATALOG, GENRES } from './node.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('genre manifests', () => {
  for (const [id, g] of Object.entries(GENRES)) {
    describe(id, () => {
      it('is complete', () => {
        expect(g.id).toBe(id);
        expect(Object.keys(g.systems).length).toBeGreaterThan(2);
        for (const r of g.requiredSystems) expect(g.systems[r]).toBeDefined();
        expect(g.feelPresets[g.defaultFeel]).toBeDefined();
        expect(g.bots[g.solverBot]).toBeDefined();
        expect(g.gddFragment.length).toBeGreaterThan(100);
        expect(g.interviewFragment.length).toBeGreaterThan(50);
        expect(g.exemplars.length).toBeGreaterThan(2);
        expect(g.gddDefaults.pillars).toHaveLength(3);
        expect(g.gddDefaults.verbs.length).toBeGreaterThan(0);
        for (const s of g.samples) expect(existsSync(resolve(root, s, 'package.json'))).toBe(true);
        for (const p of g.panels) expect(g.systems[p.systemId]?.meta.params[p.param]).toBeDefined();
      });
      it('exemplars validate against their schemas and the catalog', () => {
        for (const ex of g.exemplars) {
          if (ex.kind === 'level') expect(ARTIFACT_SCHEMAS.LevelJson.safeParse(ex.artifact).success).toBe(true);
          if (ex.kind === 'behaviour') expect(ARTIFACT_SCHEMAS.BehaviourFsm.safeParse(ex.artifact).success).toBe(true);
          if (ex.kind === 'waves') expect(ARTIFACT_SCHEMAS.WaveTable.safeParse(ex.artifact).success).toBe(true);
          if (ex.kind === 'systems') {
            const parsed = ARTIFACT_SCHEMAS.SystemsJson.parse(ex.artifact);
            expect(checkSystems(parsed, CATALOG).ok).toBe(true);
          }
        }
      });
      it('generates a level the validator accepts and the solver bot completes', () => {
        let done = false;
        for (let seed = 1; seed <= 6 && !done; seed++) {
          const level = g.levelGrammar.generate({ seed, difficulty: 0.2 });
          if (!g.levelGrammar.validate(level, g.feelPresets[g.defaultFeel]!).ok) continue;
          const sim = createSim({
            level,
            feel: g.feelPresets[g.defaultFeel]!,
            seed,
            systems: Object.values(g.systems).map((m) => m.create()),
            entityDefs: g.entityDefs,
            player: g.player,
            behaviours: g.defaultBehaviours,
            rules: g.defaultRules,
            params: g.systems['survival'] ? { survival: { winAtS: 30 } } : {},
            content: g.extraContent?.({ seed, difficulty: 0.2 }) ?? {},
            movementMode: g.movementMode,
          });
          done = runBot(sim, g.bots[g.solverBot]!, 60 * 60).completed;
        }
        expect(done).toBe(true);
      });
    });
  }
  it('builds one catalog with no duplicate ids across genres', () => {
    expect(Object.keys(CATALOG).length).toBeGreaterThan(8);
    expect(CATALOG['pickups']?.genres).toBe('*');
  });
});
