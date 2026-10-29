import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_SCHEMAS, CreateRequest, GddFrontmatter } from '@gg/schemas';
import { GENRES } from '@gg/templates/node';
import { checkGdd } from '@gg/validators';
import { describe, expect, it } from 'vitest';
import { FakeProvider, heuristicRoute, routeVocabulary } from './fake-provider.js';
import { draftBody, draftFrontmatter, renderGdd, slugify, titleFromPrompt } from './gdd-draft.js';
import { AUTHORED_CONTENT_PLAN, CREATE_STAGES, createPlan, editPlan } from './plan.js';
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
      for (const authored of [false, true]) {
        const plan = editPlan(route, presets, authored);
        expect(plan.slice(-2).map((s) => s.stage)).toEqual(['budget', 'publish']);
        for (const s of plan) expect(presets[s.stage], `${route}:${s.stage}`).toBeDefined();
      }
    }
  });
  it('authored content replaces the level search with apply-content; other routes ignore the flag', () => {
    expect(editPlan('content', presets, true).map((s) => s.stage)).toEqual([...AUTHORED_CONTENT_PLAN]);
    expect(editPlan('content', presets).map((s) => s.stage)[0]).toBe('levels');
    expect(editPlan('parameter', presets, true).map((s) => s.stage)).toEqual(editPlan('parameter', presets).map((s) => s.stage));
    expect(presets['apply-content']?.gate).toEqual(['validate:levels', 'validate:ramp', 'solver']);
    expect(presets['apply-content']?.runner).toBe('worker');
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
  const vocab = (id: string) => routeVocabulary(GENRES[id]!);
  it('routes explicit assignments to parameter or style with a patch', () => {
    const p = heuristicRoute('set hazards.respawnDelayTicks=20 and combat-stomp.bounceVy=-120', vocab('platformer'));
    expect(p.route).toBe('parameter');
    expect(p.paramPatch).toEqual([
      { key: 'hazards.respawnDelayTicks', value: 20 },
      { key: 'combat-stomp.bounceVy', value: -120 },
    ]);
    expect(heuristicRoute('set palette.accent=#ff8800', vocab('platformer')).route).toBe('style');
  });
  it('routes wording to behaviour, content or code', () => {
    expect(heuristicRoute('make the walker chase more aggressively', vocab('platformer'))).toMatchObject({ route: 'behaviour', targets: ['walker'] });
    expect(heuristicRoute('make level 2 harder', vocab('platformer'))).toMatchObject({ route: 'content', targets: ['l02'] });
    expect(heuristicRoute('add a grappling hook', vocab('platformer')).route).toBe('code');
    expect(heuristicRoute('add a grappling hook', vocab('platformer')).confidence).toBeLessThan(0.7);
  });
  it("names the behaviour the game's own enemy runs, by type or behaviour id, singular or plural", () => {
    // A top-down brute runs its own behaviour; a survivors brute runs the chaser's.
    expect(heuristicRoute('the brute should wind up longer', vocab('topdown-action')).targets).toEqual(['brute']);
    expect(heuristicRoute('make the brutes slower', vocab('survivors')).targets).toEqual(['chaser']);
    expect(heuristicRoute("the archer's arrows come too fast", vocab('topdown-action')).targets).toEqual(['archer']);
    expect(heuristicRoute('the warden slams too often', vocab('topdown-action')).targets).toEqual(['warden']);
    expect(heuristicRoute('drones should weave more', vocab('shmup')).targets).toEqual(['drone']);
    // An enemy this game does not have is not a target: the route stays generic.
    expect(heuristicRoute('make the enemies like the turret in my other game', vocab('survivors'))).toMatchObject({ route: 'behaviour', targets: [] });
    // Items run behaviours too (the shmup's power-up drifts), but naming one is not an edit to enemy behaviour.
    expect(heuristicRoute('give the player more power', vocab('shmup')).route).toBe('code');
  });
  it("the fake router reads the game's behaviours from the routing prompt", async () => {
    const g = GENRES['topdown-action']!;
    const res = await new FakeProvider({ genre: g, request: null }).structured({ model: 'fake', system: '', schemaName: 'EditRoute', schema: {}, prompt: 'Message: slow the brute down\n\nGenre: topdown-action. Levels: l01. Behaviours: grunt, brute, warden.' });
    expect((res.data as { targets: string[] }).targets).toEqual(['brute']);
  });
});
