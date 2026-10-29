import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '@gg/db';
import type { LevelJson } from '@gg/schemas';
import { defaultSystems } from '@gg/scaffold';
import { checkLevel } from '@gg/template-core';
import { genre } from '@gg/templates/node';
import { afterAll, describe, expect, it } from 'vitest';
import type { StageContext } from './runners/types.js';
import { WorkerRunner } from './runners/worker.js';

const g = genre('platformer');
const systems = defaultSystems('platformer', g.optionalSystems);
const kit = { runtime: g, validate: g.levelGrammar.validate, bots: g.bots, solverBot: g.solverBot };

/** A generated level the oracle accepts, named like the levels stage names it. */
function solvableLevel(): LevelJson {
  for (let seed = 1; seed <= 20; seed++) {
    const level: LevelJson = {
      ...g.levelGrammar.generate({ seed, difficulty: 0.2 }),
      id: 'l01',
      name: 'Level 1',
      ramp: { segment: 0, difficulty: 0.2 },
    };
    if (checkLevel(kit, level, systems).ok) return level;
  }
  throw new Error('no solvable platformer level in 20 seeds');
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function gameWith(level: LevelJson): { gameDir: string; file: string } {
  const gameDir = mkdtempSync(join(tmpdir(), 'gg-apply-content-'));
  dirs.push(gameDir);
  mkdirSync(join(gameDir, 'design'), { recursive: true });
  mkdirSync(join(gameDir, 'content', 'levels'), { recursive: true });
  writeFileSync(join(gameDir, 'design', 'systems.json'), JSON.stringify(systems));
  const file = join(gameDir, 'content', 'levels', 'L01-l01.json');
  writeFileSync(file, JSON.stringify(level));
  return { gameDir, file };
}

function ctxFor(gameDir: string, levels: unknown[] | null): StageContext {
  return {
    jobId: 'j1',
    gameId: 'g1',
    spec: { stage: 'apply-content', gate: [] },
    attempt: 1,
    workDir: join(gameDir, '..'),
    gameDir,
    policy: null,
    model: 'none',
    provider: 'none',
    store: {} as Store,
    log: () => {},
    dryRun: true,
    request: null,
    route: {
      designNotes: 'level editor',
      route: 'content',
      targets: ['l01'],
      affectedScenes: [],
      confidence: 1,
      paramPatch: [],
    },
    edit: levels
      ? { message: 'level editor', dryRun: true, content: { levels: levels as LevelJson[] } }
      : null,
    versionId: 'v1',
  };
}

const readLevel = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as LevelJson;
const base = solvableLevel();
const runner = new WorkerRunner();

describe('apply-content (levels authored in the editor)', () => {
  it('accepts an edit the validator and the solver bot pass, writes it and keeps the ramp', async () => {
    const { gameDir, file } = gameWith(base);
    const edited: LevelJson = {
      ...base,
      ramp: undefined,
      entities: [...base.entities, { type: 'coin', x: base.spawn.x, y: base.spawn.y, props: {} }],
    };
    const out = await runner.run(ctxFor(gameDir, [edited]));
    expect(out.ok, out.summary).toBe(true);
    const written = readLevel(file);
    expect(written.entities).toHaveLength(base.entities.length + 1);
    expect(written.ramp).toEqual(base.ramp);
  });

  it('rejects a level whose goal is walled off and leaves the file untouched', async () => {
    const { gameDir, file } = gameWith(base);
    const solid = Object.entries(base.legend).find(([, k]) => k === 'solid')![0];
    const wallX = base.goal.x - 3;
    const walled: LevelJson = {
      ...base,
      rows: base.rows.map((row) => row.slice(0, wallX) + solid + row.slice(wallX + 1)),
    };
    const out = await runner.run(ctxFor(gameDir, [walled]));
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('semantic_invalid');
    expect(out.summary).toMatch(/goal/);
    expect(readLevel(file)).toEqual(base);
  });

  it('rejects a level id the game does not have', async () => {
    const { gameDir } = gameWith(base);
    const out = await runner.run(ctxFor(gameDir, [{ ...base, id: 'l99' }]));
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('semantic_invalid');
    expect(out.summary).toMatch(/does not exist/);
  });

  it('rejects a malformed level with the schema error', async () => {
    const { gameDir } = gameWith(base);
    const out = await runner.run(ctxFor(gameDir, [{ ...base, rows: base.rows.slice(1) }]));
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('schema_invalid');
  });

  it('needs authored content on the edit request', async () => {
    const { gameDir } = gameWith(base);
    const out = await runner.run(ctxFor(gameDir, null));
    expect(out.ok).toBe(false);
    expect(out.failureMode).toBe('spec_violation');
  });
});
