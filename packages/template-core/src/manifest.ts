import type { ArtifactName, BehaviourFsm, CuratedGenre, DialogueFile, EcaRule, FeedbackChannel, GddFrontmatter, LevelJson, ParamValue, ScopeTier, StyleCard, SystemsJson } from '@gg/schemas';
import type { EntityDef, FeelPreset, InputState, Sim, SystemDef } from '@gg/sdk';
import type { CatalogSystem, EntityRole, Issue, ValidationReport } from '@gg/validators';

/** A system plus its catalog metadata. Params arrive at runtime through ctx.params from systems.json. */
export interface SystemModule {
  meta: CatalogSystem;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create(): SystemDef<any>;
}

/** What a block's level hooks know of the game: its movement and feel, and its names and parameters for the block. */
export interface BlockLevelCtx {
  movementMode: 'platformer' | 'topdown';
  feel: FeelPreset;
  /** The game's name for each of the block's own entity types ('cargo' -> 'teapot'). */
  typeOf(blockType: string): string;
  /** The definition of one of the game's entity types (sizes for placing it). */
  defOf(type: string): EntityDef | undefined;
  /** The block's parameters as the game sets them, over the catalog's defaults. */
  params: Readonly<Record<string, ParamValue>>;
  /** The level's place in the game, from 0, where it is known (a level generated for a slot, or named for one). */
  level?: number;
  /** The game's talk (content/dialogue.json), where it has one: who its story places in which level. */
  story?: DialogueFile | null;
}

/**
 * A block: a catalog system only freeform games compose (a runner, a courier's job), with what it brings beyond the
 * system. Its own entity types, under its own names (a courier's cargo and stations: '<block>:<type>' to a roster),
 * which work whatever way the player moves; feedback for its own events; a bot that plays its job, which proves a
 * level before the explorer tries; and hooks that place its entities on the levels the base genre generates and check
 * them there.
 */
export interface BlockModule extends SystemModule {
  archetypes?: ReadonlyArray<{ def: EntityDef; roles: readonly EntityRole[] }>;
  feedbackExtras?: Array<{ event: string; channels: FeedbackChannel[] }>;
  bot?: BotPolicy;
  /** The level with the block's entities placed: deterministic from the generator's seed. */
  dress?(level: LevelJson, seed: number, ctx: BlockLevelCtx): LevelJson;
  /** What is wrong with the block's entities on a level (placed by dress, or by hand in the editor). */
  checkLevel?(level: LevelJson, ctx: BlockLevelCtx): Issue[];
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
  /** The level's place in the game, from 0: what blocks place by the level (the people a story puts in it). */
  level?: number;
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
  /**
   * The castle tier (16 px tiles, a hero about 42 px tall, a 480x270 view, its own feel and budgets), where a template
   * asks for it; absent, the 8 px tier every game has had.
   */
  tier?: 'castle';
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
  /**
   * Bot that must complete it too, playing as a person would (late to see a wind-up, its timing a little off): a level
   * only the solver can finish asks too much of a player. Absent: the solver alone.
   */
  fairBot?: string;
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
  /**
   * Content files every game of the genre ships as the genre writes them, content/<key>.json, which a game may then
   * edit (the castle's moves: the frame data its sword and its view follow). The scaffold writes them.
   */
  shippedContent?: Readonly<Record<string, unknown>>;
  bots: Record<string, BotPolicy>;
  /** Bot that must complete a valid level (the solvability oracle at playtest time). */
  solverBot: string;
  /** Bot that must complete it too, as a person would play it (GenreCheck.fairBot). */
  fairBot?: string;
  gddFragment: string;
  interviewFragment: string;
  /**
   * Where the genre's look starts, before the idea or a reference changes it: the castle tier's 480x270 view, its
   * palette, its frame rates. Absent, the platform's default style.
   */
  styleDefaults?: Partial<Pick<StyleCard, 'canvas' | 'palette' | 'animationFps'>>;
  scopeBudget: Record<ScopeTier, ScopeBudget>;
  /**
   * The difficulty a game of one level plays it at, by tier (absent: 0.25 at every tier). A castle region grows with
   * the tier: more halls, the later foes, the boss.
   */
  singleLevelDifficulty?: Readonly<Record<ScopeTier, number>>;
  gddDefaults: GddDefaults;
  panels: PanelSpec[];
  exemplars: Exemplar[];
  /** Repo-relative paths of golden sample game packages. */
  samples: string[];
}
