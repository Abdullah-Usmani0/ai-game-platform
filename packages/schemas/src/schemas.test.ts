import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnyGddFrontmatter, parseAnyGdd, parseSystemsFile, ARTIFACT_SCHEMAS, BehaviourFsm, CreateRequest, CURATED_GENRES, EntityRoster, FreeformGddFrontmatter, GddFrontmatter, GENRES, JamInput, LevelJson, LevelProof, Objectives, PLAYABLE_GENRES, SystemsFile, SystemsJson, toJsonSchema } from './index';

describe('LevelJson', () => {
  const base = {
    version: 1 as const,
    id: 'l01',
    name: 'First steps',
    tileSize: 16,
    width: 8,
    height: 6,
    legend: { '.': 'air', '#': 'solid', '^': 'hazard' },
    rows: ['........', '........', '........', '....^...', '########', '########'],
    spawn: { x: 1, y: 3 },
    goal: { x: 7, y: 3 },
  };
  it('parses a valid level', () => {
    expect(LevelJson.parse(base).entities).toEqual([]);
  });
  it('rejects row/width mismatch and unknown legend chars', () => {
    const bad = { ...base, rows: [...base.rows.slice(0, 5), '#######'] };
    expect(() => LevelJson.parse(bad)).toThrow(/length/);
    const bad2 = { ...base, rows: [...base.rows.slice(0, 5), '#####?##'] };
    expect(() => LevelJson.parse(bad2)).toThrow(/missing from legend/);
  });
});

describe('BehaviourFsm', () => {
  it('rejects transitions to unknown states', () => {
    const fsm = {
      version: 1 as const,
      id: 'walker',
      initial: 'patrol',
      states: {
        patrol: { update: [{ kind: 'patrol', speed: 40 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 80 } }] },
      },
    };
    expect(() => BehaviourFsm.parse(fsm)).toThrow(/unknown 'chase'/);
  });
  it('accepts a two-state fsm', () => {
    const fsm = {
      version: 1 as const,
      id: 'walker',
      initial: 'patrol',
      states: {
        patrol: { update: [{ kind: 'patrol', speed: 40 }], transitions: [{ to: 'chase', when: { kind: 'player_within', px: 80 } }] },
        chase: { update: [{ kind: 'move_toward_player', speed: 70 }], transitions: [{ to: 'patrol', when: { kind: 'player_beyond', px: 160 } }] },
      },
    };
    expect(BehaviourFsm.parse(fsm).states.chase?.onEnter).toEqual([]);
  });
});

describe('GddFrontmatter and SystemsJson', () => {
  it('requires exactly three pillars', () => {
    const gdd = {
      title: 'Cave Hop',
      genre: 'platformer',
      scopeTier: 'small',
      pillars: ['tight jumps', 'readable hazards'],
      scope: { levels: 3, enemies: 2, items: 1, bosses: 0 },
      targets: { sessionMin: 10, levelTimeS: 60, deathsPerLevel: 3 },
      verbs: ['run', 'jump'],
      feedbackEvents: [{ event: 'jump', channels: ['sfx'] }],
    };
    expect(() => GddFrontmatter.parse(gdd)).toThrow();
    expect(GddFrontmatter.parse({ ...gdd, pillars: [...gdd.pillars, 'short levels'] }).pillars).toHaveLength(3);
  });
  it('parses systems.json', () => {
    const s = SystemsJson.parse({ version: 1, genre: 'platformer', feelPreset: 'celeste-class', systems: [{ id: 'movement-platformer' }] });
    expect(s.systems[0]?.params).toEqual({});
  });
});

describe('JSON Schema export', () => {
  it('exports every artifact without recursion ($ref cycles)', () => {
    for (const name of Object.keys(ARTIFACT_SCHEMAS) as Array<keyof typeof ARTIFACT_SCHEMAS>) {
      const schema = toJsonSchema(name);
      const text = JSON.stringify(schema);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/"\$ref":"#"/);
    }
  });
});

describe('playable genres', () => {
  it('create requests and jams take only genres with a template', () => {
    const req = (genre: string) => CreateRequest.safeParse({ prompt: 'A game made of ten words or more, enough to pass.', genre });
    for (const g of PLAYABLE_GENRES) expect(req(g).success, g).toBe(true);
    for (const g of GENRES.filter((x) => !(PLAYABLE_GENRES as readonly string[]).includes(x))) expect(req(g).success, g).toBe(false);
    expect(req('deckbuilder').success).toBe(false);
    const jam = (genres: string[]) => JamInput.safeParse({ slug: 'spring-jam', title: 'Spring jam', theme: 'growth', genres, startsAt: '2026-11-01T00:00:00Z', submissionsClose: '2026-11-08T00:00:00Z', votingClose: '2026-11-15T00:00:00Z' });
    expect(jam(['puzzle', 'lifesim']).success).toBe(true);
    expect(jam(['deckbuilder']).success).toBe(false);
  });
});

describe('Objectives', () => {
  it('fills the defaults and bounds every clause', () => {
    const o = Objectives.parse({ version: 1, win: { clauses: [{ kind: 'defeat', count: 'all' }, { kind: 'collect', type: 'gem', count: 3 }] } });
    expect(o.win.mode).toBe('all');
    expect(o.lose).toEqual([]);
    const ok = (win: unknown, lose: unknown = []) => Objectives.safeParse({ version: 1, win, lose }).success;
    expect(ok({ clauses: [] })).toBe(false);
    expect(ok({ clauses: [{ kind: 'survive', seconds: 2 }] })).toBe(false);
    expect(ok({ clauses: [{ kind: 'defeat', count: 0 }] })).toBe(false);
    expect(ok({ clauses: [{ kind: 'score_at_least', value: 3 }] })).toBe(false);
    expect(ok({ clauses: [{ kind: 'reach_goal' }] }, [{ kind: 'lives', count: 0 }])).toBe(false);
    expect(ok({ mode: 'any', clauses: [{ kind: 'reach_goal' }, { kind: 'survive', seconds: 60 }] }, [{ kind: 'time_out', seconds: 90 }])).toBe(true);
  });
});

describe('freeform', () => {
  const gdd = {
    title: 'Hive',
    genre: 'platformer',
    scopeTier: 'small',
    pillars: ['swarm pressure', 'every swing counts', 'short runs'],
    scope: { levels: 1, enemies: 2, items: 1, bosses: 0 },
    targets: { sessionMin: 5, levelTimeS: 60, deathsPerLevel: 2 },
    verbs: ['move', 'attack'],
    feedbackEvents: [{ event: 'hit', channels: ['sfx'] }],
  };

  it("the curated design schemas, and the structured calls built on them, stay exactly as they were", () => {
    // Freeform files have schemas of their own; a change here changes every curated prompt, so it needs a reason.
    const hash = (name: Parameters<typeof toJsonSchema>[0]) => createHash('sha256').update(JSON.stringify(toJsonSchema(name))).digest('hex').slice(0, 16);
    expect({ GddFrontmatter: hash('GddFrontmatter'), SystemsJson: hash('SystemsJson'), BehaviourFsm: hash('BehaviourFsm'), EcaRule: hash('EcaRule'), WaveTable: hash('WaveTable'), EditRoute: hash('EditRoute') }).toEqual({
      GddFrontmatter: '62b2bac5f36b50e5',
      SystemsJson: '5db9814c9cb7ee9a',
      BehaviourFsm: 'bfd19052b00a3c0c',
      EcaRule: 'b74e8a8a3ef2a254',
      WaveTable: '1f7d2cffadcf4df3',
      EditRoute: 'baee82f997a7a79c',
    });
    expect(GddFrontmatter.safeParse({ ...gdd, genre: 'freeform' }).success).toBe(false);
  });

  it('a freeform game names the curated genre it builds on, in its GDD and its systems.json', () => {
    const fm = FreeformGddFrontmatter.parse({ ...gdd, genre: 'freeform', base: 'survivors' });
    expect(fm.base).toBe('survivors');
    expect(FreeformGddFrontmatter.safeParse({ ...gdd, genre: 'freeform' }).success).toBe(false);
    expect(FreeformGddFrontmatter.safeParse({ ...gdd, genre: 'freeform', base: 'freeform' }).success).toBe(false);
    expect(AnyGddFrontmatter.parse(gdd).genre).toBe('platformer');
    expect(AnyGddFrontmatter.parse({ ...gdd, genre: 'freeform', base: 'puzzle' })).toMatchObject({ genre: 'freeform', base: 'puzzle' });
    const systems = { version: 1, genre: 'freeform', feelPreset: 'arena-melee', systems: [{ id: 'movement-topdown' }, { id: 'melee-attack' }, { id: 'objectives' }] };
    expect(SystemsFile.parse({ ...systems, composition: { base: 'survivors' } })).toMatchObject({ composition: { base: 'survivors' } });
    expect(SystemsFile.safeParse(systems).success).toBe(false);
    expect(SystemsFile.parse({ ...systems, genre: 'survivors' }).genre).toBe('survivors');
    expect(CURATED_GENRES).not.toContain('freeform');
    // Parsed by genre: a curated file fails with the curated schema's own issues, a freeform one needs its base.
    expect(parseSystemsFile({ ...systems, composition: { base: 'survivors' } }).success).toBe(true);
    expect(parseSystemsFile(systems).error?.issues.map((i) => i.path.join('.'))).toEqual(['composition']);
    expect(parseSystemsFile({ ...systems, genre: 'survivors', feelPreset: 'A' }).error?.issues.map((i) => i.path.join('.'))).toEqual(['feelPreset']);
    expect(parseAnyGdd({ ...gdd, genre: 'freeform' }).error?.issues.map((i) => i.path.join('.'))).toEqual(['base']);
    expect(parseAnyGdd(gdd).success).toBe(true);
  });

  it("a roster renames shipped entities, each archetype once, and bounds what it tunes", () => {
    const roster = EntityRoster.parse({ version: 1, types: [{ type: 'wasp', archetype: 'survivors:chaser' }, { type: 'hornet', archetype: 'survivors:brute', hp: 1.5 }] });
    expect(roster.types[0]!.hp).toBe(1);
    expect(roster.player).toEqual({});
    const bad = (types: unknown[]) => EntityRoster.safeParse({ version: 1, types }).success;
    expect(bad([{ type: 'wasp', archetype: 'survivors:chaser' }, { type: 'wasp', archetype: 'survivors:brute' }])).toBe(false);
    expect(bad([{ type: 'wasp', archetype: 'survivors:chaser' }, { type: 'bee', archetype: 'survivors:chaser' }])).toBe(false);
    expect(bad([{ type: 'player', archetype: 'survivors:chaser' }])).toBe(false);
    expect(bad([{ type: 'wasp', archetype: 'chaser' }])).toBe(false);
    expect(bad([{ type: 'wasp', archetype: 'survivors:chaser', hp: 5 }])).toBe(false);
  });

  it('a proof is a bounded recorded run', () => {
    const proof = { version: 1, level: 'l01', seed: 1, ticks: 300, by: 'explorer', script: [{ from: 0, to: 120, input: { right: true } }, { from: 120, to: 300, input: { right: true, jump: true } }] };
    expect(LevelProof.parse(proof).script).toHaveLength(2);
    expect(LevelProof.safeParse({ ...proof, by: 'guess' }).success).toBe(false);
    expect(LevelProof.safeParse({ ...proof, script: [{ from: 0, to: 10, input: { fly: true } }] }).success).toBe(false);
    expect(LevelProof.safeParse({ ...proof, script: [{ from: 10, to: 10, input: {} }] }).success).toBe(false);
    expect(LevelProof.safeParse({ ...proof, ticks: 0 }).success).toBe(false);
  });
});
