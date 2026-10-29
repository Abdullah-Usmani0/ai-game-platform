import type { FreeformSystemsJson } from '@gg/schemas';
import { createSim, type FeedbackBinding } from '@gg/sdk';
import { rolesPresent, runBot, simOptionsFor, systemsJsonFor } from '@gg/template-core';
import { checkComposition } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { compose } from './compose.js';
import { EXAMPLES, HEIST, HIVE, LANTERN } from './examples.js';
import { BASE_MANIFESTS, checkFreeformObjectives } from './node.js';
import { CURATED_IDS } from './registry.js';

describe('compose', () => {
  it("a curated genre's own systems on its own base, with an empty roster, play exactly as that genre", () => {
    for (const g of CURATED_IDS) {
      const m = BASE_MANIFESTS[g];
      const sys = systemsJsonFor(m);
      const file: FreeformSystemsJson = { ...sys, genre: 'freeform', composition: { base: g } };
      const { runtime, issues } = compose(file);
      expect(issues, g).toEqual([]);
      expect(runtime.feedbackExtras, g).toEqual(m.feedbackExtras ?? []);
      for (const params of [{ seed: 1, difficulty: 0.3 }, { seed: 2, difficulty: 0.6 }]) {
        const level = m.levelGrammar.generate(params);
        const content = m.extraContent?.(params) ?? {};
        const feedback = [...m.gddDefaults.feedbackEvents, ...(m.feedbackExtras ?? [])] as FeedbackBinding[];
        const curated = createSim({ ...simOptionsFor(m, sys, { behaviours: m.defaultBehaviours, content, feedback }), level, seed: 2 });
        const freeform = createSim({ ...simOptionsFor(runtime, file, { behaviours: m.defaultBehaviours, content, feedback }), level, seed: 2 });
        for (const bot of Object.keys(m.bots)) {
          expect(runBot(freeform, m.bots[bot]!, 3000), `${g} ${bot} seed ${params.seed}`).toEqual(runBot(curated, m.bots[bot]!, 3000));
          curated.reset();
          freeform.reset();
        }
      }
    }
  });

  it('composes systems from several genres into games the composition rules accept', () => {
    for (const ex of EXAMPLES) {
      const { runtime, issues } = compose(ex.systems, ex.roster);
      expect(issues, ex.id).toEqual([]);
      const base = BASE_MANIFESTS[ex.systems.composition.base];
      const content = [...Object.keys(base.extraContent?.({ seed: 1, difficulty: 0.3 }) ?? {}), ...(ex.objectives ? ['objectives'] : [])];
      expect(checkComposition(Object.values(runtime.systems).map((m) => m.meta), { roles: rolesPresent(runtime), content }).issues, ex.id).toEqual([]);
      expect(runtime.movementMode, ex.id).toBe(base.movementMode);
      expect(runtime.feelPresets[ex.systems.feelPreset], ex.id).toBeDefined();
    }
  });

  it('sets what models never do: the roster names in entity parameters, and the yielding death rule off', () => {
    expect(compose(HEIST.systems, HEIST.roster).runtime.composedParams).toEqual({ 'auto-attack': { dropType: 'shard' }, 'room-clear': { healType: 'cell' } });
    const lantern = compose(LANTERN.systems, LANTERN.roster).runtime;
    expect(lantern.composedParams).toEqual({ hazards: { respawn: false } });
    expect(lantern.entityDefs.find((d) => d.type === 'lantern')).toMatchObject({ pickup: true, drawAs: 'coin' });
    expect(compose(HIVE.systems, HIVE.roster).runtime.composedParams).toEqual({});
    // The custom events the game fires get their genre's feedback: the melee's finishers, the vault keeper's slam and
    // enrage (the warden's behaviour fires them).
    expect(compose(HIVE.systems, HIVE.roster).runtime.feedbackExtras?.map((f) => f.event)).toEqual(['custom:finisher']);
    expect(compose(HEIST.systems, HEIST.roster).runtime.feedbackExtras?.map((f) => f.event)).toEqual(['custom:slam', 'custom:enrage']);
  });

  it("the examples' objectives are ones their games can mean", () => {
    for (const ex of EXAMPLES) if (ex.objectives) expect(checkFreeformObjectives(ex.systems, ex.roster, ex.objectives).issues, ex.id).toEqual([]);
    // Lanterns are collectible; a beetle is not.
    const wrong = { ...LANTERN.objectives!, win: { mode: 'all' as const, clauses: [{ kind: 'collect' as const, type: 'beetle', count: 2 }] } };
    expect(checkFreeformObjectives(LANTERN.systems, LANTERN.roster, wrong).issues.map((i) => i.code)).toEqual(['objective_type']);
    // A hive arena has no goal tile to reach.
    const goal = { ...HIVE.objectives!, win: { mode: 'all' as const, clauses: [{ kind: 'reach_goal' as const }] } };
    expect(checkFreeformObjectives(HIVE.systems, HIVE.roster, goal).issues.map((i) => i.code)).toEqual(['no_goal']);
  });

  it('names systems no genre ships', () => {
    const file: FreeformSystemsJson = { ...HIVE.systems, systems: [...HIVE.systems.systems, { id: 'jetpack', params: {} }] };
    expect(compose(file, HIVE.roster).issues.map((i) => i.code)).toEqual(['unknown_system']);
  });
});
