import { notFound } from 'next/navigation';
import { JamBoard } from '@/components/JamBoard';
import { viewerId } from '@/lib/identity';
import { jamView } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function JamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = getStore();
  const jam = await store.getJam(slug);
  if (!jam) notFound();
  return (
    <main>
      <JamBoard initial={await jamView(store, jam, await viewerId())} />
    </main>
  );
}
