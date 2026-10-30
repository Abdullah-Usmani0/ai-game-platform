import type { ArtifactName, BehaviourFsm, CuratedGenre, EcaRule, FeedbackChannel, GddFrontmatter, LevelJson, ParamValue, ScopeTier, SystemsJson } from '@gg/schemas';
import type { EntityDef, FeelPreset, InputState, Sim, SystemDef } from '@gg/sdk';
import type { CatalogSystem, EntityRole, Issue, ValidationReport } from '@gg/validators';

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

/**
 * A Node-side bot policy over the sim: returns the input for the current tick. While an in-game menu is open the
 * runner picks the highlighted option for it, unless the policy says it drives menus itself (`menus: true`).
 */
export type BotPolicy = ((sim: Sim, tick: number, memory: Record<string, number>) => InputState) & { menus?: boolean };

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
  /** A curated genre, or 'freeform' for a game composed from several (built by @gg/template-freeform). */
  id: CuratedGenre | 'freeform';
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
  /**
   * Feedback for the genre's own custom events (a finisher, a boss slam, a door opening). The GDD's table names only
   * the fixed events; the scaffold appends these to design/feedback.json so every generated game binds them.
   */
  feedbackExtras?: Array<{ event: string; channels: FeedbackChannel[] }>;
  /**
   * This genre's defaults for parameters of shared catalog systems (top-down action dashes through attacks, other
   * top-down genres do not), applied over the catalog's own defaults wherever a systems.json is drafted.
   */
  paramDefaults?: Record<string, Record<string, ParamValue>>;
  /**
   * Roles entity types fill beyond what their definitions say (hostile and collectible are read from the definitions):
   * the metroidvania's relics, keys and doors, the puzzle's crates and targets. Composition checks systems' needs
   * against them.
   */
  entityRoles?: Record<string, EntityRole[]>;
  /**
   * Parameters the game's composition sets and systems.json never does: the roster's names for the types systems name
   * (a renamed drop), and the switches of death rules that yield to another. Applied over systems.json's params.
   */
  composedParams?: Record<string, Record<string, ParamValue>>;
}

/**
 * The browser-safe check kit of a genre: the static level validator, the bots and the solver, with no Node imports.
 * The worker's gates, the scaffold oracle and the level editor's in-browser check all run this same code.
 */
export interface GenreCheck {
  runtime: GenreRuntime;
  validate(level: LevelJson, feel: FeelPreset): ValidationReport;
  bots: Record<string, BotPolicy>;
  /** Bot that must complete a valid level (the solvability oracle). */
  solverBot: string;
}

/**
 * A content file the design stage writes from the player's idea (a farm's crops: content/crops.json), held to the
 * game's rules. A freeform game writes it when it runs a system that reads it.
 */
export interface DesignContent {
  /** The file, content/<key>.json, and the key the sim's content has it under. */
  key: string;
  /** The structured artifact the model writes. */
  artifact: ArtifactName;
  /** The systems that read it. */
  readBy: readonly string[];
  /** What the model is told the content is and how it plays. */
  guide: string;
  /** The genre's own content: what the model is shown as an example, and what the game plays with when no answer holds. */
  fallback: unknown;
  /**
   * What is wrong with a value for a game with these systems: its schema first, then how it plays with the rules. An
   * error leaves nothing worth playing, a warning is content no player should be shown. The design stage sends both
   * back to the model; the gate fails on errors only, so a later parameter edit may leave a poor buy on the shelf.
   */
  check(value: unknown, systems: Pick<SystemsJson, 'systems'>): Issue[];
  /** The rules the content is written for, in a sentence or two for the prompt. */
  rules(systems: Pick<SystemsJson, 'systems'>): string;
  /** Among values that pass, how good one is (higher is better). */
  score?(value: unknown): number;
}

/** Node-only part: generators, validators, bots, prompt fragments, exemplars, panels, samples. */
export interface GenreManifest extends GenreRuntime {
  levelGrammar: {
    /** A farm's levels are seasons on one farm map, won by the purse rather than at a goal. */
    kind: 'tilemap' | 'arena' | 'rooms' | 'graph' | 'farm';
    generate(params: LevelGenParams): LevelJson;
    validate(level: LevelJson, feel: FeelPreset): ValidationReport;
  };
  /** Extra content files (e.g. waves) generated alongside a level at a difficulty; keys become content/<key>.json. */
  extraContent?: (params: LevelGenParams) => Record<string, unknown>;
  /** Content files the design stage writes from the idea (a farm's crops). */
  designContent?: readonly DesignContent[];
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
