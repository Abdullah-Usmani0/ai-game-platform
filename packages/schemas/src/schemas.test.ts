import { describe, expect, it } from 'vitest';
import { ARTIFACT_SCHEMAS, BehaviourFsm, GddFrontmatter, LevelJson, SystemsJson, toJsonSchema } from './index.js';

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
