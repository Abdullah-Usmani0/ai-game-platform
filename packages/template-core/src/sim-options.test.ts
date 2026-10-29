import { CELESTE_CLASS } from '@gg/sdk';
import { describe, expect, it } from 'vitest';
import type { GenreRuntime } from './manifest.js';
import { simOptionsFor, systemsJsonFor } from './sim-options.js';
import { pickups, meta as pickupsMeta } from './systems/pickups.js';

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
