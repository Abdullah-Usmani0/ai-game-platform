import { notFound, redirect } from 'next/navigation';
import { GameWorkspace } from '@/components/GameWorkspace';
import type { PanelItem } from '@/components/ParamPanel';
import type { StyleLike } from '@/components/StyleEditor';
import { canSeeWorkspace } from '@/lib/access';
import { viewerId } from '@/lib/identity';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The creator's workspace: progress of the active job, playable preview of the head version, evidence, edit chat, code.
 * Only the owner (and moderators) see it; anyone else is sent to the play page.
 */
export default async function GamePage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const q = await searchParams;
  const store = getStore();
  const game = await store.getGame(gameId);
  if (!game) notFound();
  if (!(await canSeeWorkspace(store, game, await viewerId()))) redirect(`/play/${game.id}`);
  const [versions, jobs] = await Promise.all([store.listVersions(gameId), store.listJobs(gameId)]);
  const head = versions.find((v) => v.isHead) ?? null;
  const running = jobs.find((j) => j.status === 'queued' || j.status === 'running');
  const jobParam = typeof q['job'] === 'string' ? q['job'] : undefined;
  return (
    <main>
      <GameWorkspace
        game={{ id: game.id, title: game.title, genre: game.genre, state: game.state, conceptMd: game.conceptMd ?? '', headVersionId: game.headVersionId }}
        initialJobId={running?.id ?? jobParam ?? jobs[jobs.length - 1]?.id ?? null}
        initialHead={
          head
            ? {
                id: head.id,
                number: head.number,
                bundleBase: bundleBaseUrl(head.bundlePath),
                evidence: (head.design as { evidence?: Record<string, unknown> }).evidence ?? null,
                panels: (head.design as { panels?: PanelItem[] }).panels ?? null,
                style: (head.design as { style?: StyleLike }).style ?? null,
              }
            : null
        }
      />
    </main>
  );
}
