import type { GameRow, JobRow, Store } from '@gg/db';
import { promptHash } from '@gg/llm';
import type { PairDraft } from './runners/types.js';

/** A stage's model-written artifact once its gate passed, waiting for the job to finish. */
export interface VerifiedPair extends PairDraft {
  stage: string;
  model: string;
  provider: string;
  /** The stage's gate report. */
  verifiedBy: string | null;
}

export interface PairJob {
  store: Store;
  job: JobRow;
  game: GameRow | null;
  genre: string | null;
  dryRun: boolean;
  policyVersion: number | null;
}

/** Everyone whose content a job's artifacts carry: the requester, the game's owner and the owners of the games it was remixed from. */
export async function contributorsOf(store: Store, job: JobRow, game: GameRow | null): Promise<string[]> {
  const ids = new Set([job.userId]);
  if (game) {
    ids.add(game.ownerId);
    for (const l of await store.listLineage(game.id)) {
      const ancestor = await store.getGame(l.ancestorGameId);
      if (ancestor) ids.add(ancestor.ownerId);
    }
  }
  return [...ids];
}

/**
 * Records the job's verified pairs as training data (the job finished with every gate passed). Nothing is recorded
 * for a dry run or the fake provider (exemplar echoes, not model output), or when a contributor opted out of training.
 * Never throws: a finished game must not fail because its training data could not be stored.
 */
export async function recordPairs(src: PairJob, pairs: readonly VerifiedPair[]): Promise<{ recorded: number; skipped?: string }> {
  const real = pairs.filter((p) => p.provider !== 'fake' && p.model !== 'fake');
  if (src.dryRun || real.length === 0) return { recorded: 0, skipped: pairs.length > 0 ? 'dry run' : undefined };
  let recorded = 0;
  try {
    const contributors = await contributorsOf(src.store, src.job, src.game);
    for (const u of contributors) if (await src.store.trainingOptOut(u)) return { recorded: 0, skipped: 'a contributor opted out of training' };
    for (const p of real) {
      const row = await src.store.insertTrainingPair({
        stage: p.stage,
        genre: src.genre,
        artifact: p.artifact,
        input: { system: p.system, prompt: p.prompt },
        output: p.output,
        inputHash: promptHash(p.system, p.prompt, p.artifact),
        model: p.model,
        provider: p.provider,
        jobId: src.job.id,
        gameId: src.game?.id ?? src.job.gameId,
        contributors,
        verifiedBy: p.verifiedBy,
        policyVersion: src.policyVersion,
      });
      if (row) recorded++;
    }
    return { recorded };
  } catch (e) {
    return { recorded, skipped: `store error: ${(e as Error).message}` };
  }
}
