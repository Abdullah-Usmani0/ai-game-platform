import { describe, expect, it } from 'vitest';
import { ARTIFACT_SCHEMAS, BehaviourFsm, CreateRequest, GddFrontmatter, GENRES, JamInput, LevelJson, Objectives, PLAYABLE_GENRES, SystemsJson, toJsonSchema } from './index';

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
    expect(jam(['puzzle', 'shmup']).success).toBe(true);
    expect(jam(['lifesim']).success).toBe(false);
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
