/**
 * The golden lock: what every curated genre does today, pinned. Generated levels, every bot's run on them (final hash,
 * ticks, deaths, event counts), the runtime data (entity defs, feel, behaviours, vocab, panels, exemplars, prompts'
 * fragments, system metadata, the content the design stage writes), every sprite's pixels and terrain painting under
 * two palettes, and the sound presets.
 * Shared code may change freely as long as this stays green; an intended change to a curated game updates the lock in
 * the same commit, with the reason in the message: `GOLDEN_UPDATE=1 pnpm --filter @gg/templates test golden`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LevelJson } from '@gg/schemas';
import { createSim, hashValue, Tilemap, type FeelPreset } from '@gg/sdk';
import { artPalette, paintFrames, paintRegion, prepareLevelArt, PixelCanvas, RECIPES, SETTING_BY_GENRE, SFX_PRESETS, type PaletteRoles } from '@gg/sdk/art';
import { runBot, simOptionsFor, systemsJsonFor, type GenreManifest, type LevelGenParams } from '@gg/template-core';
import { describe, expect, it } from 'vitest';
import { GENRES } from './node.js';

const DIR = fileURLToPath(new URL('../golden/', import.meta.url));
const UPDATE = process.env['GOLDEN_UPDATE'] === '1';
const BOT_TICKS = 4000;

type Golden = Record<string, unknown>;

function check(name: string, actual: Golden): void {
  const file = `${DIR}${name}.json`;
  if (UPDATE) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
    return;
  }
  expect(existsSync(file), `${file} missing: run GOLDEN_UPDATE=1 pnpm --filter @gg/templates test golden`).toBe(true);
  const expected = JSON.parse(readFileSync(file, 'utf8')) as Golden;
  // Two levels deep, key by key, so a failure names exactly what changed (a level, a bot, a sprite).
  const isObject = (v: unknown): v is Golden => typeof v === 'object' && v !== null && !Array.isArray(v);
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const a = actual[key];
    const e = expected[key];
    if (isObject(a) && isObject(e)) {
      for (const sub of new Set([...Object.keys(e), ...Object.keys(a)])) expect(a[sub], `${name}: ${key}.${sub}`).toEqual(e[sub]);
    } else expect(a, `${name}: ${key}`).toEqual(e);
  }
}

/** The levels each genre is pinned on: two seeds at three difficulties, plus boss floors where the generator has them. */
function plans(g: GenreManifest): LevelGenParams[] {
  const out: LevelGenParams[] = [];
  for (const difficulty of [0.2, 0.5, 0.75]) for (const seed of [1, 2]) out.push({ seed, difficulty });
  if (g.id === 'topdown-action') for (const seed of [1, 2]) out.push({ seed, difficulty: 0.55, boss: 1 });
  return out;
}

const tag = (p: LevelGenParams) => Object.entries(p).map(([k, v]) => `${k}${v}`).join('-');

describe('golden lock: curated genres', () => {
  for (const g of Object.values(GENRES)) {
    it(`${g.id} runtime, generators and bots are unchanged`, () => {
      const golden: Golden = {};
      golden['runtime'] = {
        movementMode: g.movementMode,
        defaultFeel: g.defaultFeel,
        requiredSystems: g.requiredSystems,
        optionalSystems: g.optionalSystems,
        entityDefs: hashValue(g.entityDefs),
        player: g.player,
        feelPresets: hashValue(g.feelPresets),
        behaviourVocab: hashValue(g.behaviourVocab),
        defaultBehaviours: hashValue(g.defaultBehaviours),
        defaultRules: hashValue(g.defaultRules),
        collectibleTypes: g.collectibleTypes,
        feedbackExtras: hashValue(g.feedbackExtras ?? []),
        paramDefaults: hashValue(g.paramDefaults ?? {}),
        systemsMeta: hashValue(Object.fromEntries(Object.entries(g.systems).map(([id, m]) => [id, { params: m.meta.params, emits: m.meta.emits, feedbackFor: m.meta.feedbackFor, required: m.meta.required ?? false }]))),
        scopeBudget: hashValue(g.scopeBudget),
        gddDefaults: hashValue(g.gddDefaults),
        gddFragment: hashValue(g.gddFragment),
        interviewFragment: hashValue(g.interviewFragment),
        panels: hashValue(g.panels),
        exemplars: hashValue(g.exemplars),
        levelGrammar: g.levelGrammar.kind,
        solverBot: g.solverBot,
        bots: Object.keys(g.bots).sort(),
        ...(g.designContent ? { designContent: hashValue(g.designContent.map((d) => ({ key: d.key, artifact: d.artifact, readBy: d.readBy, guide: d.guide, fallback: d.fallback }))) } : {}),
      };
      const systems = systemsJsonFor(g);
      const feel: FeelPreset = g.feelPresets[g.defaultFeel]!;
      const levels: Record<string, string> = {};
      const runs: Record<string, unknown> = {};
      for (const params of plans(g)) {
        const level = g.levelGrammar.generate(params);
        const content = g.extraContent?.(params) ?? {};
        levels[tag(params)] = hashValue({ level, content });
        const report = g.levelGrammar.validate(level, feel);
        runs[`${tag(params)}:validate`] = { ok: report.ok, issues: report.issues.map((i) => i.code).sort() };
        const options = simOptionsFor(g, systems, { behaviours: g.defaultBehaviours, content });
        for (const name of Object.keys(g.bots).sort()) {
          const r = runBot(createSim({ ...options, level: level as LevelJson, seed: 1 }), g.bots[name]!, BOT_TICKS);
          runs[`${tag(params)}:${name}`] = { completed: r.completed, ticks: r.ticks, deaths: r.deaths, finalHash: r.finalHash, events: r.events };
        }
      }
      golden['levels'] = levels;
      golden['runs'] = runs;
      check(g.id, golden);
    });
  }
});

describe('golden lock: art and sound', () => {
  const PALETTES: Record<string, PaletteRoles> = {
    dusk: { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff' },
    ember: { background: '#1a1210', mid: '#4a3328', foreground: '#f5e6c8', accent: '#ff9f43', danger: '#e63946', ui: '#ffffff' },
  };
  const pixels = (pc: PixelCanvas) => hashValue([pc.w, pc.h, Array.from(pc.data)]);

  it('every sprite paints the same pixels', () => {
    const golden: Golden = {};
    for (const [palName, roles] of Object.entries(PALETTES)) {
      for (const outline of ['dark', 'colored', 'selective', 'none'] as const) {
        const pal = artPalette(roles, outline);
        for (const [name, recipe] of Object.entries(RECIPES)) golden[`${palName}:${outline}:${name}`] = hashValue(paintFrames(recipe, pal).map((f) => [f.anim, f.frame, pixels(f.pc)]));
      }
    }
    check('sprites', golden);
  });

  it('terrain paints the same pixels in every setting', () => {
    const golden: Golden = {};
    const pal = artPalette(PALETTES['ember']!, 'dark');
    for (const g of Object.values(GENRES)) {
      const level = g.levelGrammar.generate({ seed: 3, difficulty: 0.5 });
      const map = new Tilemap(level);
      const setting = SETTING_BY_GENRE[g.id] ?? 'side';
      for (const exitLocked of [false, true]) {
        const art = prepareLevelArt(pal, setting, map, exitLocked);
        const pc = new PixelCanvas(Math.min(256, level.width * level.tileSize), Math.min(144, level.height * level.tileSize));
        paintRegion(art, pc, 0, 0);
        golden[`${g.id}:${setting}:${exitLocked ? 'locked' : 'open'}`] = pixels(pc);
      }
    }
    check('terrain', golden);
  });

  it('sound presets are unchanged', () => {
    check('sound', Object.fromEntries(Object.entries(SFX_PRESETS).map(([k, v]) => [k, hashValue(v)])));
  });
});
