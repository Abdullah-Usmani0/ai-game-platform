import { TestSubmission } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** A tester's report: works or broken, one tag, a note. Needs a 30 s test play since the claim; pays the reward. */
export async function POST(req: Request, ctx: { params: Promise<{ assignmentId: string }> }): Promise<Response> {
  const { assignmentId } = await ctx.params;
  const parsed = TestSubmission.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const store = getStore();
  const me = await viewerId();
  try {
    const result = await store.submitTest(assignmentId, me, parsed.data);
    return Response.json({ ...result, credits: await store.creditBalance(me) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 409 });
  }
}
