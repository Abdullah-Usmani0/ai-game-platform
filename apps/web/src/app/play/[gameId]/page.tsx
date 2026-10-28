import { PlayFrame } from '@/components/PlayFrame';
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
  let title = safeId;
  let bundleUrl = `/bundles/${safeId}/index.html`;
  const store = getStore();
  const game = await store.getGame(safeId).catch(() => null);
  if (game?.headVersionId) {
    const head = await store.getVersion(game.headVersionId);
    const base = bundleBaseUrl(head?.bundlePath ?? null);
    if (base) {
      bundleUrl = `${base}/index.html`;
      title = game.title;
    }
  }
  return (
    <main>
      <h1>{title}</h1>
      <PlayFrame bundleUrl={bundleUrl} mode={mode} seed={seed} />
    </main>
  );
}
