import type { GameRow, Store } from '@gg/db';

/**
 * The workspace is the owner's: versions, jobs with their inputs (prompts, edit messages, private style references) and
 * the source. Moderators may look in; everyone else gets the play page.
 */
export async function canSeeWorkspace(store: Store, game: GameRow, viewer: string): Promise<boolean> {
  return game.ownerId === viewer || (await store.isModerator(viewer));
}
