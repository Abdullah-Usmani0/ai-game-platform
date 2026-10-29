import { TestDesk } from '@/components/TestDesk';

export const dynamic = 'force-dynamic';

export default function TestPage() {
  return (
    <main>
      <h1>Test queue</h1>
      <TestDesk />
    </main>
  );
}
