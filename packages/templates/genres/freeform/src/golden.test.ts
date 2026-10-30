/**
 * The golden lock for the freeform examples: what each composes to (definitions, behaviours, the parameters the
 * composition sets), the levels its base grammar generates under its names, and how each level is proven (by whom, in
 * how many ticks, with which run). An intended change updates it in the same commit, with the reason in the message:
 * `GOLDEN_UPDATE=1 pnpm --filter @gg/template-freeform test golden`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashValue } from '@gg/sdk';
import { levelPlan } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples.js';
import { BASE_MANIFESTS, freeformManifest } from './node.js';
import { proveLevel } from './prove.js';

const DIR = fileURLToPath(new URL('../golden/', import.meta.url));
const UPDATE = process.env['GOLDEN_UPDATE'] === '1';

describe('golden lock: freeform examples', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id} composes, generates and proves as it did`, () => {
      const m = freeformManifest(ex.systems, ex.roster);
      const base = BASE_MANIFESTS[ex.systems.composition.base];
      const golden: Record<string, unknown> = {
        runtime: {
          systems: m.requiredSystems,
          entityDefs: hashValue(m.entityDefs),
          types: m.entityDefs.map((d) => `${d.type}${d.drawAs ? `<${d.drawAs}` : ''}`),
          behaviours: hashValue(m.defaultBehaviours),
          vocab: hashValue(m.behaviourVocab),
          composedParams: m.composedParams ?? {},
          feedbackExtras: (m.feedbackExtras ?? []).map((f) => f.event),
          player: m.player,
        },
      };
      const plan = levelPlan(m.levelGrammar.kind, { levels: ex.gdd.scope.levels, bosses: ex.gdd.scope.bosses, tier: ex.gdd.scopeTier });
      for (const slot of plan) {
        const params = { seed: slot.index + 1, difficulty: slot.difficulty, ...(slot.boss ? { boss: 1 } : {}) };
        const level = { ...m.levelGrammar.generate(params), id: slot.id };
        const content = { ...(m.extraContent?.(params) ?? {}), ...(ex.objectives ? { objectives: ex.objectives } : {}), ...ex.content };
        const r = proveLevel(level, slot.index, { file: ex.systems, roster: ex.roster, content, solver: base.bots[base.solverBot], budget: 20_000 });
        golden[slot.id] = { level: hashValue(level), content: hashValue(content), by: r.proof?.by ?? null, ticks: r.proof?.ticks ?? null, script: r.proof ? hashValue(r.proof.script) : null };
      }
      const file = `${DIR}${ex.id}.json`;
      if (UPDATE) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(golden, null, 2) + '\n');
        return;
      }
      expect(existsSync(file), `${file} missing: run GOLDEN_UPDATE=1 pnpm --filter @gg/template-freeform test golden`).toBe(true);
      const expected = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      for (const key of new Set([...Object.keys(expected), ...Object.keys(golden)])) expect(golden[key], `${ex.id}: ${key}`).toEqual(expected[key]);
    });
  }
});
