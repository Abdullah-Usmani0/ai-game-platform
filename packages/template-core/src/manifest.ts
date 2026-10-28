import type { BehaviourFsm, EcaRule, GddFrontmatter, Genre, LevelJson, ScopeTier } from '@gg/schemas';
import type { EntityDef, FeelPreset, InputState, Sim, SystemDef } from '@gg/sdk';
import type { CatalogSystem, ValidationReport } from '@gg/validators';

/** A system plus its catalog metadata. Params arrive at runtime through ctx.params from systems.json. */
export interface SystemModule {
  meta: CatalogSystem;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(): SystemDef<any>;
}

export interface BotResult {
  completed: boolean;
  ticks: number;
  deaths: number;
  stuckMaxTicks: number;
  finalHash: string;
  events: Record<string, number>;
}

/** A Node-side bot policy over the sim: returns the input for the current tick. */
export type BotPolicy = (sim: Sim, tick: number, memory: Record<string, number>) => InputState;

export interface LevelGenParams {
  seed: number;
  /** 0..1 difficulty target; generators map it to gaps, hazards, enemies. */
  difficulty: number;
  length?: number;
  [key: string]: number | undefined;
}

export interface Exemplar {
  kind: 'level' | 'behaviour' | 'systems' | 'gdd' | 'waves';
  prompt: string;
  artifact: unknown;
}

export interface PanelSpec {
  systemId: string;
  param: string;
  label: string;
  min: number;
  max: number;
  step: number;
  affects: 'levels' | 'assets' | 'none';
}

/** Genre defaults the GDD drafter starts from (and the dry run uses verbatim). */
export interface GddDefaults {
  pillars: [string, string, string];
  verbs: string[];
  feedbackEvents: GddFrontmatter['feedbackEvents'];
  targets: GddFrontmatter['targets'];
}

export interface ScopeBudget {
  levels: number;
  enemies: number;
  items: number;
  bosses: number;
}

/** Browser-safe part of a genre: what a game bundle imports. */
export interface GenreRuntime {
  id: Genre;
  name: string;
  movementMode: 'platformer' | 'topdown';
  systems: Record<string, SystemModule>;
  requiredSystems: string[];
  optionalSystems: string[];
  feelPresets: Record<string, FeelPreset>;
  defaultFeel: string;
  entityDefs: EntityDef[];
  player: { w: number; h: number; hp: number };
  behaviourVocab: { conditions: string[]; actions: string[] };
  defaultBehaviours: BehaviourFsm[];
  defaultRules: EcaRule[];
  collectibleTypes: string[];
}

/** Node-only part: generators, validators, bots, prompt fragments, exemplars, panels, samples. */
export interface GenreManifest extends GenreRuntime {
  levelGrammar: {
    kind: 'tilemap' | 'arena' | 'rooms' | 'graph';
    generate(params: LevelGenParams): LevelJson;
    validate(level: LevelJson, feel: FeelPreset): ValidationReport;
  };
  /** Extra content files (e.g. waves) generated alongside a level at a difficulty; keys become content/<key>.json. */
  extraContent?: (params: LevelGenParams) => Record<string, unknown>;
  bots: Record<string, BotPolicy>;
  /** Bot that must complete a valid level (the solvability oracle at playtest time). */
  solverBot: string;
  gddFragment: string;
  interviewFragment: string;
  scopeBudget: Record<ScopeTier, ScopeBudget>;
  gddDefaults: GddDefaults;
  panels: PanelSpec[];
  exemplars: Exemplar[];
  /** Repo-relative paths of golden sample game packages. */
  samples: string[];
}
