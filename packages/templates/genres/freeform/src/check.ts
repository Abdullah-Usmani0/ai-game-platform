import type { EntityRoster, FreeformSystemsJson, LevelJson, LevelProof } from '@gg/schemas';
import { emptyInput, inputAtTick } from '@gg/sdk';
import type { BotPolicy, GenreCheck } from '@gg/template-core';
import { metroidvaniaCheck } from '@gg/template-metroidvania/check';
import { platformerCheck } from '@gg/template-platformer/check';
import { puzzleCheck } from '@gg/template-puzzle/check';
import { lifesimCheck } from '@gg/template-lifesim/check';
import { shmupCheck } from '@gg/template-shmup/check';
import { survivorsCheck } from '@gg/template-survivors/check';
import { topdownActionCheck } from '@gg/template-topdown-action/check';
import { err, report, type Issue } from '@gg/validators';
import { compose, IDENTITY_ROSTER, type Composed } from './compose.js';
import { inverse, retypeLevel } from './retype.js';

/** The curated genres' check kits: a freeform game is checked by its base genre's, under the base names. */
export const BASE_CHECKS = { platformer: platformerCheck, survivors: survivorsCheck, 'topdown-action': topdownActionCheck, metroidvania: metroidvaniaCheck, shmup: shmupCheck, puzzle: puzzleCheck, lifesim: lifesimCheck } as const;

/** Replays each level's recorded winning run (its proof): the solver of a freeform game. Drives menus as recorded. */
export function proofBot(proofs: readonly LevelProof[]): BotPolicy {
  const byLevel = new Map(proofs.map((p) => [p.level, p]));
  return Object.assign((sim: Parameters<BotPolicy>[0], tick: number) => {
    const p = byLevel.get(sim.world.levelId);
    return p ? inputAtTick(p.script, tick) : emptyInput();
  }, { menus: true });
}

/**
 * The check kit of a freeform game, browser-safe like every genre's: its base genre's level validator on the level under
 * the base names, plus the roster's own problems and entities the game does not define; the bots replay the proofs
 * (the solver) and press keys at random (chaos, the base genre's).
 */
export function freeformCheck(file: FreeformSystemsJson, roster: EntityRoster = IDENTITY_ROSTER, proofs: readonly LevelProof[] = []): GenreCheck & { composed: Composed } {
  const composed = compose(file, roster);
  const base = BASE_CHECKS[file.composition.base];
  const back = inverse(composed.roster.rename);
  const known = new Set(composed.runtime.entityDefs.map((d) => d.type));
  return {
    composed,
    runtime: composed.runtime,
    validate: (level: LevelJson, feel) => {
      const unknown: Issue[] = [...new Set(level.entities.map((e) => e.type).filter((t) => !known.has(t)))].map((t) => err('unknown_entity', `the level places '${t}', which the game's roster does not define`, { path: t }));
      const r = base.validate(retypeLevel(level, back), feel);
      return report([...composed.issues, ...unknown, ...r.issues], r.metrics);
    },
    bots: { proof: proofBot(proofs), ...(base.bots['chaos'] ? { chaos: base.bots['chaos'] } : {}) },
    solverBot: 'proof',
  };
}
