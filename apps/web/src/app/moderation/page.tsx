import { AppealsQueue } from '@/components/AppealsQueue';
import { ModerationQueue } from '@/components/ModerationQueue';

export const dynamic = 'force-dynamic';

export default function ModerationPage() {
  return (
    <main>
      <h1>Moderation</h1>
      <p className="lead">
        Open reports by game. Dismiss when nothing is wrong; unlist a broken game until its owner publishes a fix (no strike); warn strikes the owner and keeps the game; remove takes the
        game down with its unedited remixes and strikes the owner. Three active strikes (90 days each) block an owner from listing. A removed game's owner can appeal; a counter-notice to an ip takedown can be reinstated 14 days after it is filed, and reinstating voids the takedown's strikes.
      </p>
      <ModerationQueue />
      <AppealsQueue />
    </main>
  );
}
