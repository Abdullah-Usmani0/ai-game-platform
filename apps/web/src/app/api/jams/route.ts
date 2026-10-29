import { jamPhase } from '@gg/db';
import { JamInput } from '@gg/schemas';
import { errorMessage, viewerId } from '@/lib/identity';
import { jamErrorStatus } from '@/lib/jams';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Every jam with its phase, latest start first. */
export async function GET(): Promise<Response> {
  const jams = await getStore().listJams();
  return Response.json({ jams: jams.map((j) => ({ ...j, phase: jamPhase(j) })) });
}

/** Moderators create a jam: a theme, optional genres, and when entries open, submissions close and voting closes. */
export async function POST(req: Request): Promise<Response> {
  const parsed = JamInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'jam'}: ${i.message}`).join('; ') }, { status: 400 });
  try {
    const jam = await getStore().createJam(await viewerId(), parsed.data);
    return Response.json({ jam: { ...jam, phase: jamPhase(jam) } }, { status: 201 });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: jamErrorStatus(errorMessage(e)) });
  }
}
