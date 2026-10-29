import '@fontsource-variable/inter';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PixelMark } from '@/components/Icon';
import { IdentitySwitch } from '@/components/IdentitySwitch';
import { NavLinks } from '@/components/NavLinks';
import { viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';
import './globals.css';

export const metadata: Metadata = { title: { default: 'AI Game Platform', template: '%s · AI Game Platform' }, description: 'Community-made 2D games, built with an AI harness.' };
export const viewport: Viewport = { themeColor: '#090a0f', colorScheme: 'dark' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const moderator = await getStore()
    .isModerator(await viewerId())
    .catch(() => false);
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" aria-label="AI Game Platform, home">
              <span className="brand-mark">
                <PixelMark />
              </span>
              AI Game Platform
            </Link>
            <NavLinks moderator={moderator} />
            <IdentitySwitch />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <span>Every listed game passed its gates: bots finished it, its replay matched, its budgets held.</span>
          <span>2D games on Phaser 4 · made with an AI harness</span>
        </footer>
      </body>
    </html>
  );
}
