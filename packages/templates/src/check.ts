import type { GenreCheck } from '@gg/template-core';
import { metroidvaniaCheck } from '@gg/template-metroidvania/check';
import { platformerCheck } from '@gg/template-platformer/check';
import { puzzleCheck } from '@gg/template-puzzle/check';
import { shmupCheck } from '@gg/template-shmup/check';
import { survivorsCheck } from '@gg/template-survivors/check';
import { topdownActionCheck } from '@gg/template-topdown-action/check';

/** Browser-safe check kits by genre (no Node imports): the level editor runs the gate's own validator and solver in the page. */
export const CHECKS: Record<string, GenreCheck> = {
  platformer: platformerCheck,
  survivors: survivorsCheck,
  'topdown-action': topdownActionCheck,
  shmup: shmupCheck,
  metroidvania: metroidvaniaCheck,
  puzzle: puzzleCheck,
};

export function checkKit(genreId: string): GenreCheck {
  const kit = CHECKS[genreId];
  if (!kit)
    throw new Error(
      `no check kit for genre '${genreId}' (known: ${Object.keys(CHECKS).join(', ')})`,
    );
  return kit;
}

export { checkLevel, type LevelCheck } from '@gg/template-core';
