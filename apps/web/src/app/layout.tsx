import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IdentitySwitch } from '@/components/IdentitySwitch';
import './globals.css';

export const metadata: Metadata = { title: 'AI Game Platform', description: 'Community-made 2D games, built with an AI harness.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/">Play</Link>
          <Link href="/create">Create</Link>
          <Link href="/games">Your games</Link>
          <Link href="/test">Test queue</Link>
          <IdentitySwitch />
        </header>
        {children}
      </body>
    </html>
  );
}
