import { CELESTE_CLASS } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import type { GenreRuntime } from './manifest.js';
import { LEVEL_TICKS, levelTicksOf, simOptionsFor, systemsJsonFor } from './sim-options.js';
import { objectives } from './systems/objectives.js';
import { pickups, meta as pickupsMeta } from './systems/pickups.js';
import { survival } from './systems/survival.js';

const runtime: GenreRuntime = {
  id: 'survivors',
  name: 'Test',
  movementMode: 'topdown',
  systems: { pickups: { meta: pickupsMeta, create: () => pickups } },
  requiredSystems: ['pickups'],
  optionalSystems: [],
  feelPresets: { calm: CELESTE_CLASS },
  defaultFeel: 'calm',
  entityDefs: [],
  player: { w: 8, h: 8, hp: 1 },
  behaviourVocab: { conditions: [], actions: [] },
  defaultBehaviours: [],
  defaultRules: [],
  collectibleTypes: [],
};

describe('simOptionsFor', () => {
  it("applies what the game's composition sets over systems.json", () => {
    const file = systemsJsonFor(runtime);
    expect(simOptionsFor(runtime, file).params).toEqual({ pickups: { value: 1 } });
    expect(simOptionsFor({ ...runtime, composedParams: { pickups: { value: 5 } } }, file).params).toEqual({ pickups: { value: 5 } });
  });

  it('drafts no systems.json for a freeform runtime, whose file names its base genre', () => {
    expect(() => systemsJsonFor({ ...runtime, id: 'freeform' })).toThrow(/base genre/);
  });
});

describe('levelTicksOf', () => {
  it('gives every level 90 seconds, and as long as a system says its rules can take', () => {
    expect(levelTicksOf({ systems: [pickups] })).toBe(LEVEL_TICKS);
    // A one-minute survival fits in the 90 seconds; fifteen minutes take fifteen, and ten seconds of grace.
    expect(levelTicksOf({ systems: [survival], params: { survival: { winAtS: 60 } } })).toBe(LEVEL_TICKS);
    expect(levelTicksOf({ systems: [survival], params: { survival: { winAtS: 900 } } })).toBe(900 * 60 + 600);
    // The objectives' longest clock, with a tenth more for menus and pause.
    const content = (win: object, lose: object[] = []) => ({ objectives: { version: 1, win, lose } });
    expect(levelTicksOf({ systems: [objectives], content: content({ mode: 'all', clauses: [{ kind: 'reach_goal' }] }) })).toBe(LEVEL_TICKS);
    expect(levelTicksOf({ systems: [objectives], content: content({ mode: 'any', clauses: [{ kind: 'survive', seconds: 200 }] }) })).toBe(200 * 66 + 600);
    expect(levelTicksOf({ systems: [objectives], content: content({ mode: 'all', clauses: [{ kind: 'reach_goal' }] }, [{ kind: 'time_out', seconds: 300 }]) })).toBe(300 * 66 + 600);
  });
});
