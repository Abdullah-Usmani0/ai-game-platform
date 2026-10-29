import Link from 'next/link';
import { jamPhase, type JamPhase } from '@gg/db';
import { JamCreateForm } from '@/components/JamCreateForm';
import { viewerId } from '@/lib/identity';
import { utc } from '@/lib/jam-format';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

const SECTIONS: Array<[JamPhase, string]> = [
  ['open', 'Entries open'],
  ['voting', 'Voting'],
  ['upcoming', 'Coming up'],
  ['closed', 'Finished'],
];

export default async function JamsPage() {
  const store = getStore();
  const [jams, moderator] = await Promise.all([store.listJams(), store.isModerator(await viewerId())]);
  const phased = jams.map((j) => ({ ...j, phase: jamPhase(j) }));
  return (
    <main>
      <h1>Jams</h1>
      <p className="muted">
        A theme and a deadline. Make a game after the jam starts, publish it to the feed and enter it. When submissions close, players who played an entry for 30 seconds score it on fun,
        theme and look; results come out when voting closes.
      </p>
      {phased.length === 0 ? <p className="muted">No jams yet.</p> : null}
      {SECTIONS.map(([phase, label]) => {
        const list = phased.filter((j) => j.phase === phase);
        return list.length ? (
          <section key={phase}>
            <h2>{label}</h2>
            <ul className="jams">
              {list.map((j) => (
                <li key={j.id} data-testid="jam-item" data-slug={j.slug} data-phase={j.phase}>
                  <Link href={`/jams/${j.slug}`}>{j.title}</Link> <span className="muted">&ldquo;{j.theme}&rdquo; · {phase === 'upcoming' ? `starts ${utc(j.startsAt)}` : phase === 'open' ? `submissions close ${utc(j.submissionsClose)}` : phase === 'voting' ? `voting closes ${utc(j.votingClose)}` : `ended ${utc(j.votingClose)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      {moderator ? <JamCreateForm /> : null}
    </main>
  );
}
