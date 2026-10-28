import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_SCHEMAS, CreateRequest, GddFrontmatter } from '@gg/schemas';
import { GENRES } from '@gg/templates/node';
import { checkGdd } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { FakeProvider, heuristicRoute } from './fake-provider.js';
import { draftBody, draftFrontmatter, renderGdd, slugify, titleFromPrompt } from './gdd-draft.js';
import { CREATE_STAGES, createPlan, editPlan } from './plan.js';
import { loadPresets } from './presets.js';

const harness = resolve(fileURLToPath(new URL('../../../harness', import.meta.url)));
const presets = loadPresets(harness);

describe('stage presets and plans', () => {
  it('every create stage has a preset with a gate list and a write scope', () => {
    const plan = createPlan(presets);
    expect(plan.map((s) => s.stage)).toEqual([...CREATE_STAGES]);
    for (const s of plan) {
      expect(presets[s.stage], s.stage).toBeDefined();
      expect(Array.isArray(s.gate)).toBe(true);
      expect(s.allowedWrite, s.stage).toBeDefined();
      if (s.stage !== 'publish') expect(s.gate.length, s.stage).toBeGreaterThan(0);
    }
  });
  it('edit routes end in budget and publish', () => {
    for (const route of ['parameter', 'style', 'behaviour', 'content', 'code'] as const) {
      const plan = editPlan(route, presets);
      expect(plan.slice(-2).map((s) => s.stage)).toEqual(['budget', 'publish']);
      for (const s of plan) expect(presets[s.stage], `${route}:${s.stage}`).toBeDefined();
    }
  });
});

describe('gdd draft', () => {
  for (const [id, g] of Object.entries(GENRES)) {
    it(`drafts a valid GDD for ${id} in every tier`, () => {
      for (const scopeTier of ['small', 'medium', 'large'] as const) {
        const req = CreateRequest.parse({ prompt: 'A cosy little test game about a brave teapot.', genre: id, scopeTier, dryRun: true });
        const fm = draftFrontmatter(req, g);
        expect(GddFrontmatter.safeParse(fm).success).toBe(true);
        const r = checkGdd(renderGdd(fm, draftBody(req, g, fm)), g.scopeBudget[scopeTier]);
        expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
      }
    });
  }
  it('derives titles and slugs', () => {
    expect(titleFromPrompt('A tight cave platformer about a lantern-carrying mole.')).toBe('Tight Cave Platformer Lantern');
    expect(slugify('Tight Cave Platformer!')).toBe('tight-cave-platformer');
    expect(slugify('x')).toMatch(/^game-/);
  });
});

describe('fake provider', () => {
  const g = GENRES['platformer']!;
  const fake = new FakeProvider({ genre: g, request: CreateRequest.parse({ prompt: 'A platformer about a lantern mole.', genre: 'platformer', dryRun: true }) });
  it('answers every structured artifact with something schema-valid', async () => {
    for (const [name, prompt] of [
      ['GddFrontmatter', 'Concept: ...'],
      ['SystemsJson', 'GDD front matter: ...'],
      ['BehaviourFsm', 'Behaviour id: walker\nEntity types: walker'],
      ['EditRoute', 'Message: set hazards.respawnDelayTicks=20'],
    ] as const) {
      const res = await fake.structured({ model: 'fake', system: '', prompt, schema: {}, schemaName: name });
      expect(ARTIFACT_SCHEMAS[name].safeParse(res.data).success, name).toBe(true);
    }
  });
  it('returns the requested behaviour id', async () => {
    const res = await fake.structured({ model: 'fake', system: '', prompt: 'Behaviour id: hopper', schema: {}, schemaName: 'BehaviourFsm' });
    expect((res.data as { id: string }).id).toBe('hopper');
  });
});

describe('heuristic edit routing', () => {
  it('routes explicit assignments to parameter or style with a patch', () => {
    const p = heuristicRoute('set hazards.respawnDelayTicks=20 and combat-stomp.bounceVy=-120');
    expect(p.route).toBe('parameter');
    expect(p.paramPatch).toEqual([
      { key: 'hazards.respawnDelayTicks', value: 20 },
      { key: 'combat-stomp.bounceVy', value: -120 },
    ]);
    expect(heuristicRoute('set palette.accent=#ff8800').route).toBe('style');
  });
  it('routes wording to behaviour, content or code', () => {
    expect(heuristicRoute('make the walker chase more aggressively')).toMatchObject({ route: 'behaviour', targets: ['walker'] });
    expect(heuristicRoute('make level 2 harder')).toMatchObject({ route: 'content', targets: ['l02'] });
    expect(heuristicRoute('add a grappling hook').route).toBe('code');
    expect(heuristicRoute('add a grappling hook').confidence).toBeLessThan(0.7);
  });
});
