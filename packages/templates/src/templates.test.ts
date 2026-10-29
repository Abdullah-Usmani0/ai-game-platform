import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_SCHEMAS, CURATED_GENRES, PLAYABLE_GENRES } from '@gg/schemas';
import { createSim } from '@gg/sdk';
import { SETTING_BY_GENRE, TYPE_RECIPES } from '@gg/sdk/art';
import { checkSystems } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { runBot } from '@gg/template-core';
import { CHECKS, checkKit, checkLevel } from './check.js';
import { CATALOG, GENRES } from './node.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('genre manifests', () => {
  for (const [id, g] of Object.entries(GENRES)) {
    describe(id, () => {
      it('is complete', () => {
        expect(g.id).toBe(id);
        // At least one system: action genres compose several, a push puzzle's rules are one grid-push system.
        expect(Object.keys(g.systems).length).toBeGreaterThan(0);
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
      it('has a setting to be drawn in and hand-made art for every entity type', () => {
        expect(SETTING_BY_GENRE[id], 'add the genre to SETTING_BY_GENRE in the SDK art kit').toBeDefined();
        for (const d of g.entityDefs) expect(TYPE_RECIPES[d.type], `no sprite recipe for entity type '${d.type}'`).toBeDefined();
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
  it('has a browser-safe check kit for every genre', () => {
    expect(Object.keys(CHECKS).sort()).toEqual(Object.keys(GENRES).sort());
  });
  it('builds one catalog with no duplicate ids across genres', () => {
    expect(Object.keys(CATALOG).length).toBeGreaterThan(8);
    expect(CATALOG['pickups']?.genres).toBe('*');
  });
});

describe('check kits (the level editor runs the gate in the page)', () => {
  for (const [id, g] of Object.entries(GENRES)) {
    it(`${id}: the kit is the manifest's validator and solver, and accepts a generated level`, () => {
      const kit = checkKit(id);
      expect(kit.validate).toBe(g.levelGrammar.validate);
      expect(kit.bots).toBe(g.bots);
      expect(kit.solverBot).toBe(g.solverBot);
      expect(kit.runtime.id).toBe(g.id);
      const systems = ARTIFACT_SCHEMAS.SystemsJson.parse({ version: 1, genre: g.id, feelPreset: g.defaultFeel, systems: Object.keys(g.systems).map((s) => ({ id: s, params: s === 'survival' ? { winAtS: 30 } : {} })) });
      let ok = false;
      for (let seed = 1; seed <= 8 && !ok; seed++) {
        const level = g.levelGrammar.generate({ seed, difficulty: 0.2 });
        ok = checkLevel(kit, level, systems, { content: g.extraContent?.({ seed, difficulty: 0.2 }) ?? {} }).ok;
      }
      expect(ok).toBe(true);
    });
  }
  it('reports the validator rejection without running the solver', () => {
    const g = GENRES['platformer']!;
    const level = g.levelGrammar.generate({ seed: 1, difficulty: 0.2 });
    const broken = { ...level, goal: { x: 0, y: 0 } };
    const systems = ARTIFACT_SCHEMAS.SystemsJson.parse({ version: 1, genre: 'platformer', feelPreset: g.defaultFeel, systems: g.requiredSystems.map((s) => ({ id: s, params: {} })) });
    const r = checkLevel(checkKit('platformer'), broken, systems);
    expect(r.ok).toBe(false);
    expect(r.solver).toBeNull();
    expect(r.report.issues.some((i) => i.code === 'goal_tile_missing')).toBe(true);
  });
});

describe('playable genres', () => {
  it('every curated genre has a template and a check kit, and a game can be created in each of them or freeform', () => {
    expect(Object.keys(GENRES).sort()).toEqual([...CURATED_GENRES].sort());
    expect(Object.keys(CHECKS).sort()).toEqual([...CURATED_GENRES].sort());
    expect([...PLAYABLE_GENRES].sort()).toEqual([...CURATED_GENRES, 'freeform'].sort());
  });
});
