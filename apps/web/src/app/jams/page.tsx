import Link from 'next/link';
import { jamPhase, type JamPhase } from '@gg/db';
import { Icon } from '@/components/Icon';
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
const PHASE_TONE: Record<JamPhase, string> = { open: 'ok', voting: 'brand', upcoming: 'info', closed: 'neutral' };

export default async function JamsPage() {
  const store = getStore();
  const [jams, moderator] = await Promise.all([store.listJams(), store.isModerator(await viewerId())]);
  const phased = jams.map((j) => ({ ...j, phase: jamPhase(j) }));
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Jams</h1>
          <p className="lead">A theme and a deadline. Make a game after the jam starts, publish it and enter it. When entries close, players who played an entry for 30 seconds score it on fun, theme and look.</p>
        </div>
      </div>
      {phased.length === 0 ? (
        <div className="empty">
          <Icon name="trophy" size={22} />
          <strong>No jams yet</strong>
          <span>Moderators schedule jams; they show up here with their themes and deadlines.</span>
        </div>
      ) : null}
      {SECTIONS.map(([phase, label]) => {
        const list = phased.filter((j) => j.phase === phase);
        return list.length ? (
          <section key={phase}>
            <div className="section-head">
              <h2>{label}</h2>
            </div>
            <ul className="jams">
              {list.map((j) => (
                <li key={j.id} className="jam-card" data-testid="jam-item" data-slug={j.slug} data-phase={j.phase}>
                  <div className="cluster">
                    <span className="pill dot" data-tone={PHASE_TONE[j.phase]}>
                      {label}
                    </span>
                  </div>
                  <Link href={`/jams/${j.slug}`}>{j.title}</Link>
                  <span className="theme">Theme: &ldquo;{j.theme}&rdquo;</span>
                  <span className="muted small">
                    <Icon name="clock" size={12} /> {phase === 'upcoming' ? `starts ${utc(j.startsAt)}` : phase === 'open' ? `entries close ${utc(j.submissionsClose)}` : phase === 'voting' ? `voting closes ${utc(j.votingClose)}` : `ended ${utc(j.votingClose)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      {moderator ? (
        <div className="section-head">
          <h2>Schedule a jam</h2>
        </div>
      ) : null}
      {moderator ? <JamCreateForm /> : null}
    </main>
  );
}
