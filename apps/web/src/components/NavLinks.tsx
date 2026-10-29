'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<{ href: string; label: string; active: (path: string) => boolean; moderator?: boolean }> = [
  { href: '/', label: 'Play', active: (p) => p === '/' || p.startsWith('/play') },
  { href: '/create', label: 'Create', active: (p) => p.startsWith('/create') },
  { href: '/games', label: 'Your games', active: (p) => p.startsWith('/games') },
  { href: '/jams', label: 'Jams', active: (p) => p.startsWith('/jams') },
  { href: '/test', label: 'Test queue', active: (p) => p.startsWith('/test') },
  { href: '/moderation', label: 'Moderation', active: (p) => p.startsWith('/moderation'), moderator: true },
];

/** The main navigation, with the current section marked (moderation shows for moderators only). */
export function NavLinks({ moderator }: { moderator: boolean }) {
  const path = usePathname() ?? '/';
  return (
    <nav className="nav-links" aria-label="Main">
      {LINKS.filter((l) => !l.moderator || moderator).map((l) => (
        <Link key={l.href} href={l.href} className="nav-link" aria-current={l.active(path) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
