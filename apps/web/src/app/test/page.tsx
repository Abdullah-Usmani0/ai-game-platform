import { TestDesk } from '@/components/TestDesk';

export const dynamic = 'force-dynamic';

export default function TestPage() {
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Test queue</h1>
          <p className="lead">Play games before they are released, tell their creators whether they work, and earn credits for it.</p>
        </div>
      </div>
      <TestDesk />
    </main>
  );
}
