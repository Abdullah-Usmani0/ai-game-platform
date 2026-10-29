import { PLAY_SOURCES, type PlaySource } from '@gg/schemas';
import { PlayFrame } from '@/components/PlayFrame';
import { PlaySession } from '@/components/PlaySession';
import { RemixButton } from '@/components/RemixButton';
import { bundleBaseUrl, getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MODES = new Set(['play', 'preview', 'test']);

/** Plays a game's head version from the store; the sample bundle under /public/bundles/sample stays reachable by id. */
export default async function PlayPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const q = await searchParams;
  const modeRaw = typeof q['mode'] === 'string' ? q['mode'] : 'play';
  const mode = (MODES.has(modeRaw) ? modeRaw : 'play') as 'play' | 'preview' | 'test';
  const seedRaw = typeof q['seed'] === 'string' ? Number(q['seed']) : NaN;
  const seed = Number.isInteger(seedRaw) ? seedRaw : undefined;
  const safeId = /^[a-z0-9-]{1,64}$/.test(gameId) ? gameId : 'sample';
  const srcRaw = typeof q['src'] === 'string' ? q['src'] : 'direct';
  const source: PlaySource = (PLAY_SOURCES as readonly string[]).includes(srcRaw) ? (srcRaw as PlaySource) : 'direct';
  let title = safeId;
  let bundleUrl = `/bundles/${safeId}/index.html`;
  let session: { versionId: string; levels: number } | null = null;
  const store = getStore();
  const game = await store.getGame(safeId).catch(() => null);
  if (game?.headVersionId) {
    const head = await store.getVersion(game.headVersionId);
    const base = bundleBaseUrl(head?.bundlePath ?? null);
    if (base && head) {
      bundleUrl = `${base}/index.html`;
      title = game.title;
      const levels = Number((head.design as { gdd?: { scope?: { levels?: number } } }).gdd?.scope?.levels ?? 1);
      session = { versionId: head.id, levels: Number.isFinite(levels) && levels > 0 ? levels : 1 };
    }
  }
  return (
    <main>
      <h1>
        {title} {game?.headVersionId ? <RemixButton gameId={game.id} /> : null}
      </h1>
      {session && game && mode === 'play' ? (
        <PlaySession gameId={game.id} versionId={session.versionId} bundleUrl={bundleUrl} source={source} levels={session.levels} seed={seed} rating />
      ) : (
        <PlayFrame bundleUrl={bundleUrl} mode={mode} seed={seed} />
      )}
    </main>
  );
}
