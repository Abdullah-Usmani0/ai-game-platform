import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { genreLabel } from '@/lib/genres';

/**
 * A game in a grid: its mid-play screenshot (or a placeholder), genre, title and a line of stats. The whole card links to
 * `href` through the title; `children` (buttons) sit above that link.
 */
export function GameCard({ gameId, href, title, genre, cover, rank, meta, badge, status, testId, children }: { gameId: string; href: string; title: string; genre: string; cover: string | null; rank?: number; meta: Array<{ icon: IconName; text: string }>; badge?: string; status?: ReactNode; testId?: string; children?: ReactNode }) {
  return (
    <li className="game-card" data-testid={testId} data-game={gameId}>
      <Link href={href} className="cover" tabIndex={-1} aria-hidden="true">
        {cover ? <img src={cover} alt="" loading="lazy" width={320} height={180} /> : <span className="cover-empty">{genreLabel(genre)}</span>}
        <span className="pill">{genreLabel(genre)}</span>
        {rank ? <span className="rank">#{rank}</span> : null}
      </Link>
      <div className="body">
        <div className="cluster">
          <Link href={href} className="title">
            {title}
          </Link>
          {status}
        </div>
        <div className="meta">
          {meta.map((m) => (
            <span key={m.text}>
              <Icon name={m.icon} size={13} /> {m.text}
            </span>
          ))}
          {badge ? (
            <span className="ok">
              <Icon name="check" size={13} /> {badge}
            </span>
          ) : null}
        </div>
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </li>
  );
}
