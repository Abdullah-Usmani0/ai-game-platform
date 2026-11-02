import type { DialogueFile, FreeformBase, EntityRoster, FreeformSystemsJson, LevelProof, Objectives } from '@gg/schemas';
import { grammarHasGoal, rolesOf, type DesignContent, type GenreManifest, type PanelSpec } from '@gg/template-core';
import { checkObjectives, type ValidationReport } from '@gg/validators';
import { lifesim } from '@gg/template-lifesim/node';
import { metroidvania } from '@gg/template-metroidvania/node';
import { platformer } from '@gg/template-platformer/node';
import { puzzle } from '@gg/template-puzzle/node';
import { shmup } from '@gg/template-shmup/node';
import { survivors } from '@gg/template-survivors/node';
import { topdownAction } from '@gg/template-topdown-action/node';
import { dressLevel } from './blocks.js';
import { freeformCheck } from './check.js';
import { compose, IDENTITY_ROSTER } from './compose.js';
import { SYSTEMS, usableSystems } from './registry.js';
import { retypeContent, retypeLevel } from './retype.js';

export * from './index.js';
export * from './check.js';
export * from './prove.js';

/** The curated genres' full manifests: a freeform game takes its level grammar, budgets and prompts from its base's. */
export const BASE_MANIFESTS: Readonly<Record<FreeformBase, GenreManifest>> = { platformer, survivors, 'topdown-action': topdownAction, metroidvania, shmup, puzzle, lifesim };

/** The content files a game's design stage writes for the systems it runs, from whichever genre ships them (a farm's crops). */
export function designContentFor(systemIds: readonly string[]): DesignContent[] {
  const out: DesignContent[] = [];
  for (const m of Object.values(BASE_MANIFESTS)) {
    for (const d of m.designContent ?? []) if (d.readBy.some((id) => systemIds.includes(id)) && !out.some((o) => o.key === d.key)) out.push(d);
  }
  return out;
}

/**
 * A freeform game's manifest, the same shape as a genre's: its composed runtime and check kit, and its base genre's
 * level grammar and content generators, which now generate under the game's names, with what its blocks place (the
 * people its talk puts in each level: `story`). Budgets, defaults and prompts are the base's; panels are those of the
 * selected systems, from whichever genre ships them.
 */
export function freeformManifest(file: FreeformSystemsJson, roster: EntityRoster = IDENTITY_ROSTER, proofs: readonly LevelProof[] = [], story: DialogueFile | null = null): GenreManifest {
  const base = BASE_MANIFESTS[file.composition.base];
  const kit = freeformCheck(file, roster, proofs, story);
  const { rename } = kit.composed.roster;
  const panels: PanelSpec[] = [];
  for (const m of [base, ...Object.values(BASE_MANIFESTS)]) {
    for (const p of m.panels) if (kit.runtime.systems[p.systemId] && !panels.some((q) => q.systemId === p.systemId && q.param === p.param)) panels.push(p);
  }
  const extra = base.extraContent;
  const feel = kit.runtime.feelPresets[file.feelPreset] ?? kit.runtime.feelPresets[kit.runtime.defaultFeel]!;
  return {
    ...base,
    ...kit.runtime,
    // The base genre's level under the game's names, with what its blocks place on it (a courier's stations, the people
    // its story puts in the level).
    levelGrammar: { kind: base.levelGrammar.kind, generate: (params) => dressLevel(retypeLevel(base.levelGrammar.generate(params), rename), params.seed, file, kit.composed, feel, { level: params.level ?? 0, story }), validate: kit.validate },
    extraContent: extra ? (params) => retypeContent(extra(params), rename) : undefined,
    designContent: designContentFor(file.systems.map((s) => s.id)),
    bots: kit.bots,
    solverBot: kit.solverBot,
    panels,
    exemplars: [],
    samples: [],
  };
}

/**
 * A freeform game before its systems are chosen: its base genre's manifest, offering every system that works with the
 * base's movement (the systems stage chooses among them). The GDD and systems stages work from it.
 */
export function freeformDesignManifest(base: FreeformBase): GenreManifest {
  const b = BASE_MANIFESTS[base];
  const usable = usableSystems(base);
  return {
    ...b,
    id: 'freeform',
    name: `Freeform on ${b.name.toLowerCase()}`,
    systems: Object.fromEntries(usable.map((id) => [id, { meta: SYSTEMS[id]!.meta, create: SYSTEMS[id]!.create }])),
    requiredSystems: [],
    optionalSystems: usable,
    exemplars: [],
    samples: [],
  };
}

/**
 * A freeform game's objectives, checked against its roster's roles, whether its base genre's levels have a goal, and
 * the numbers its systems keep on the HUD (with those its own systems' contracts name: `ownHud`).
 */
export function checkFreeformObjectives(file: FreeformSystemsJson, roster: EntityRoster, objectives: Objectives, ownHud: readonly string[] = []): ValidationReport {
  const { runtime } = compose(file, roster);
  return checkObjectives(objectives, { roles: rolesOf(runtime), goal: grammarHasGoal(BASE_MANIFESTS[file.composition.base].levelGrammar.kind), hud: new Set([...hudKeysOf(runtime), ...ownHud]) });
}

/** The numbers a composed game's systems keep on the HUD: what a hud_at_least goal can count, besides the score. */
export function hudKeysOf(runtime: Pick<GenreManifest, 'systems'>): string[] {
  return [...new Set(Object.values(runtime.systems).flatMap((m) => m.meta.hud ?? []))].sort();
}
