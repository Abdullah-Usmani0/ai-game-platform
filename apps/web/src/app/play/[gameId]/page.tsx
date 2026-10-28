import { PlayFrame } from '@/components/PlayFrame';

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MODES = new Set(['play', 'preview', 'test']);

/** Phase 0: bundles live under /public/bundles/<gameId>/; later versions come from the CDN origin via the manifest. */
export default async function PlayPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const q = await searchParams;
  const modeRaw = typeof q['mode'] === 'string' ? q['mode'] : 'play';
  const mode = (MODES.has(modeRaw) ? modeRaw : 'play') as 'play' | 'preview' | 'test';
  const seedRaw = typeof q['seed'] === 'string' ? Number(q['seed']) : NaN;
  const seed = Number.isInteger(seedRaw) ? seedRaw : undefined;
  const safeId = /^[a-z0-9-]{1,64}$/.test(gameId) ? gameId : 'sample';
  return (
    <main>
      <h1>{safeId}</h1>
      <PlayFrame bundleUrl={`/bundles/${safeId}/index.html`} mode={mode} seed={seed} />
    </main>
  );
}
